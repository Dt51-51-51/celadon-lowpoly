// One-command production deploy: build -> prepare -> back up and apply pending migrations -> register private app -> deploy -> smoke -> rollback on failure.
// Usage (from the product checkout, on the operator machine):
//   node --import tsx scripts/deploy-production.ts            # full deploy to https://polyspoon.com and https://www.polyspoon.com
//   node --import tsx scripts/deploy-production.ts --dry-run  # build + prepare + checks only, no remote writes
// Private inputs live in ~/.polyspoon-deploy (bindings.json, supabase-service-key); never printed.
import {mkdir,readFile,writeFile,lstat} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {homedir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {verifyHostedRelease,productionConfiguration} from '../server/deployment.ts';
import {deriveAndCheckPublicFiles} from './public-allowlist.ts';

import {smokePlan,runSmoke} from './deploy-preflight.ts';
import {readdir} from 'node:fs/promises';
/** Migration files that the remote d1_migrations table has not recorded yet, in file order. */
export function pendingMigrations(files:string[],applied:string[]):string[]{
 const done=new Set(applied);return files.filter(name=>/^\d{4}_.+\.sql$/.test(name)).sort().filter(name=>!done.has(name));
}
const stamp=()=>{const d=new Date(),p=(n:number)=>String(n).padStart(2,'0');return `${p(d.getMonth()+1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;};
function run(cmd:string,args:string[],opts:{cwd:string;input?:string;capture?:boolean}){
 const r=spawnSync(cmd,args,{cwd:opts.cwd,input:opts.input,encoding:'utf8',stdio:[opts.input===undefined?'ignore':'pipe',opts.capture?'pipe':'inherit','inherit'],maxBuffer:64*1024*1024});
 if(r.status!==0)throw Error(`command_failed (status ${r.status??r.signal??r.error?.message}): ${cmd.split("/").at(-1)} ${args.filter(a=>!a.startsWith("/home")).slice(0,3).join(" ")}`);return r.stdout??'';
}
async function main(){
 const dryRun=process.argv.includes('--dry-run'),root=resolve(dirname(fileURLToPath(import.meta.url)),'..'),server=join(root,'server'),secrets=join(homedir(),'.polyspoon-deploy'),id=stamp();
 const wrangler=join(server,'node_modules/.bin/wrangler'),origin='https://polyspoon.com';
 console.log('1/6 build hosted release');const releaseDir=join(root,'.release','hosted-'+id);
 run(process.execPath,['--import','tsx','hosted/build.ts','--out',releaseDir],{cwd:root});
 console.log('2/6 prepare production config');const release=await verifyHostedRelease(releaseDir),{allowlist,references}=await deriveAndCheckPublicFiles(releaseDir);
 const bindingsPath=join(secrets,'bindings.json'),stat=await lstat(bindingsPath);if((stat.mode&0o077)!==0)throw Error('private_binding_file_required');
 const b=JSON.parse(await readFile(bindingsPath,'utf8')) as {account_id:string;database_id:string;supabase_url:string};
 const out=join(secrets,'candidate-'+id);await mkdir(out,{mode:0o700});
 const config=productionConfiguration({accountId:b.account_id,databaseId:b.database_id,supabaseUrl:b.supabase_url,release,configDirectory:out});
 if(JSON.stringify(JSON.parse(config.vars.PUBLIC_FILES))!==JSON.stringify(allowlist))throw Error('public_allowlist_drift');
 const cfg=join(out,'wrangler.production.json');await writeFile(cfg,JSON.stringify(config,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(`   release ${release.releaseHash.slice(0,12)}, ${allowlist.length} public files, ${references.length} HTML/CSS references all allowlisted`);
 if(dryRun){console.log('dry run: stopping before remote writes. Config: '+cfg);return;}
 console.log('3/7 apply pending database migrations');
 const appliedRows=JSON.parse(run(wrangler,['d1','execute','polyspoon-production','--remote','--json','-c',cfg,'--command','SELECT name FROM d1_migrations'],{cwd:server,capture:true})) as {results:{name:string}[]}[];
 const pending=pendingMigrations(await readdir(join(root,'migrations')),appliedRows[0]?.results.map(row=>row.name)??[]);
 if(pending.length){const backups=join(secrets,'backups');await mkdir(backups,{recursive:true,mode:0o700});
  run(wrangler,['d1','export','polyspoon-production','--remote','-c',cfg,'--output',join(backups,`polyspoon-production-${id}-predeploy.sql`)],{cwd:server});
  console.log('   applying '+pending.join(', '));run(wrangler,['d1','migrations','apply','polyspoon-production','--remote','-c',cfg],{cwd:server,input:'y\n'});}
 else console.log('   none pending');
 console.log('4/7 register private app release if new');
 const count=run(wrangler,['d1','execute','polyspoon-production','--remote','--json','-c',cfg,'--command',`SELECT COUNT(*) AS n FROM app_asset WHERE release_hash='${release.releaseHash}'`],{cwd:server,capture:true});
 const n=Number((JSON.parse(count) as {results:{n:number}[]}[])[0]?.results[0]?.n??0);
 if(n!==Object.keys(release.privateFiles).length){const sql=join(secrets,`app-${release.releaseHash.slice(0,8)}-${id}.sql`),key=await readFile(join(secrets,'supabase-service-key'),'utf8');
  run(process.execPath,['--import','tsx','scripts/upload-private-release.ts','--release',releaseDir,'--bindings',bindingsPath,'--sql',sql],{cwd:root,input:key});
  run(wrangler,['d1','execute','polyspoon-production','--remote','-c',cfg,'--file',sql,'-y'],{cwd:server});}
 console.log('5/7 record current version for rollback');
 const deployments=JSON.parse(run(wrangler,['deployments','list','--json','-c',cfg],{cwd:server,capture:true})) as {created_on:string;versions:{version_id:string}[]}[];
 const previous=deployments.sort((a,c)=>a.created_on.localeCompare(c.created_on)).at(-1)?.versions[0]?.version_id;if(!previous)throw Error('no_previous_version_for_rollback');
 console.log('6/7 wrangler deploy');run(wrangler,['deploy','-c',cfg],{cwd:server});
 console.log('7/7 smoke test '+origin);const checks=smokePlan(references);let failures:string[]=[];
 for(let attempt=0;attempt<6;attempt++){await new Promise(r=>setTimeout(r,attempt?10000:5000));failures=await runSmoke(origin,checks);if(!failures.length)break;}
 if(failures.length){console.error('SMOKE FAILED:\n  '+failures.join('\n  ')+'\nRolling back to '+previous);run(wrangler,['rollback',previous,'-c',cfg,'-y','--message','deploy-production smoke failure'],{cwd:server});process.exitCode=1;return;}
 console.log(`OK: ${checks.length} smoke checks passed on ${origin} (release ${release.releaseHash.slice(0,12)}). Previous version ${previous}.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main().catch(error=>{console.error(error instanceof Error?error.message:'deploy_production_failed');process.exitCode=1;});
