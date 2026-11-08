import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,symlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {verifyHostedRelease,productionConfiguration,releaseOperationPlan,migrationInventory,workerBundleReport} from '../server/deployment.ts';
import {canonical} from '../src/review/identity.ts';

const hash=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
async function fixture(){
 await mkdir('server/.local',{recursive:true});const root=await mkdtemp(resolve('server/.local/deployment-'));await mkdir(join(root,'public'));await mkdir(join(root,'app'));
 const publicBody='<!doctype html><title>Synthetic public release</title>',privateBody='<!doctype html><title>Synthetic private release</title>',file=(text:string)=>({sha256:hash(text),bytes:Buffer.byteLength(text),media_type:'text/html; charset=utf-8'}),publicFiles={'index.html':file(publicBody)},privateFiles={'index.html':file(privateBody)},releaseHash=hash(canonical(privateFiles));
 await writeFile(join(root,'public/index.html'),publicBody);await writeFile(join(root,'app/index.html'),privateBody);await writeFile(join(root,'public-files.json'),JSON.stringify({formatVersion:1,files:publicFiles}));await writeFile(join(root,'private-release.json'),JSON.stringify({formatVersion:1,releaseHash,files:privateFiles}));await writeFile(join(root,'public-imports.json'),JSON.stringify(['hosted/public/main.ts']));return {root,releaseHash};
}
test('production preflight verifies hosted inputs and emits no local/paid bindings',async()=>{
 const {root,releaseHash}=await fixture(),release=await verifyHostedRelease(root),config=productionConfiguration({accountId:'1'.repeat(32),databaseId:'11111111-1111-4111-8111-111111111111',supabaseUrl:'https://fixture.supabase.co',release,configDirectory:root});
 assert.equal(config.name,'polyspoon-production');assert.equal(config.vars.APP_ENV,'production');assert.equal(config.vars.APP_ORIGIN,'https://polyspoon.com');assert.deepEqual(config.routes,[{pattern:'polyspoon.com',custom_domain:true},{pattern:'www.polyspoon.com',custom_domain:true}]);assert.equal(config.vars.PRIVATE_APP_RELEASE,releaseHash);assert.equal(config.workers_dev,false);assert.equal(config.preview_urls,false);assert.equal(config.assets.run_worker_first,true);assert.deepEqual(JSON.parse(config.vars.PUBLIC_FILES),['/index.html']);assert.equal(config.d1_databases[0]?.binding,'DB');
 for(const key of ['r2_buckets','usage_model','unsafe'])assert.ok(!Object.hasOwn(config,key));for(const key of ['LOCAL_OBJECTS','LOCAL_MAIL_SINK','AUTH_SECRET','RESEND_API_KEY','SUPABASE_SERVICE_KEY'])assert.ok(!Object.hasOwn(config.vars,key));
 const plan=releaseOperationPlan(release);assert.equal(plan.remoteWritesExecuted,false);assert.equal(plan.activationAllowed,false);assert.ok(plan.blockers.includes('actual_free_plan_status_required'));assert.equal(plan.resources.bucket.public,false);assert.equal(plan.resources.bucket.fileSizeLimit,2097152);
 const local=JSON.parse(await readFile('server/wrangler.json','utf8'));assert.equal(local.vars.APP_ENV,'local');assert.ok(local.r2_buckets.length>0);
});
test('preflight rejects changed, undeclared or private public content',async()=>{
 const {root}=await fixture();await writeFile(join(root,'app/index.html'),'tampered');await assert.rejects(verifyHostedRelease(root),/release_file_mismatch/);
 const extra=await fixture();await writeFile(join(extra.root,'public/unlisted.txt'),'undeclared');await assert.rejects(verifyHostedRelease(extra.root),/release_inventory_mismatch/);
 const imported=await fixture();await writeFile(join(imported.root,'public-imports.json'),JSON.stringify(['hosted/app/main.ts']));await assert.rejects(verifyHostedRelease(imported.root),/private_public_import/);
 const traversal=await fixture();await writeFile(join(traversal.root,'public-files.json'),JSON.stringify({formatVersion:1,files:{'../private.js':{sha256:'a'.repeat(64),bytes:1,media_type:'text/javascript'}}}));await assert.rejects(verifyHostedRelease(traversal.root),/invalid_release_manifest/);
 const linked=await fixture();await symlink(join(linked.root,'app/index.html'),join(linked.root,'public/link.html'));await assert.rejects(verifyHostedRelease(linked.root),/release_symlink_forbidden/);
});
test('configuration refuses placeholder bindings and non-private provider origins',async()=>{
 const {root}=await fixture(),release=await verifyHostedRelease(root),base={accountId:'1'.repeat(32),databaseId:'11111111-1111-4111-8111-111111111111',supabaseUrl:'https://fixture.supabase.co',release,configDirectory:root};
 assert.throws(()=>productionConfiguration({...base,databaseId:'00000000-0000-0000-0000-000000000001'}),/invalid_production_binding/);assert.throws(()=>productionConfiguration({...base,supabaseUrl:'http://fixture.supabase.co'}),/invalid_production_storage/);assert.throws(()=>productionConfiguration({...base,supabaseUrl:'https://fixture.supabase.co/public'}),/invalid_production_storage/);
});

test('migration inventory follows all current SQL files instead of a pinned last migration',async()=>{
 const {root}=await fixture(),directory=join(root,'migrations');await mkdir(directory);await writeFile(join(directory,'0001_first.sql'),'SELECT 1;');await writeFile(join(directory,'9999_future.sql'),'SELECT 2;');const records=await migrationInventory(directory);assert.deepEqual(records.map(r=>r.name),['0001_first.sql','9999_future.sql']);assert.equal(records[1]?.sha256,hash('SELECT 2;'));
});

test('private binding parse failures never echo file contents',async()=>{
 const {root}=await fixture(),bindings=join(root,'private-bindings.txt');await writeFile(bindings,'PRIVATE_SENTINEL_123456789',{mode:0o600});
 try{await promisify(execFile)(process.execPath,['--import','tsx','server/deployment.ts','--release',root,'--out',join(root,'candidate'),'--bindings',bindings]);assert.fail('Invalid private binding file accepted');}catch(error){const failure=error as Error&{stderr?:string};assert.ok(!failure.stderr?.includes('PRIVATE_'));assert.match(failure.stderr??'',/invalid_private_binding_file/);}
});

test('Worker size uses current uncompressed policy independently of object and CPU limits',()=>{
 const report=workerBundleReport('Total Upload: 2548.17 KiB / gzip: 430.28 KiB');assert.equal(report.withinScriptLimit,true);assert.equal(report.limitBytes,67108864);assert.equal(report.compressedLimitBytes,null);assert.equal(report.runtimeCpuQualified,false);
 assert.equal(workerBundleReport('Total Upload: 10 MiB / gzip: 4 MiB').withinScriptLimit,true);assert.throws(()=>workerBundleReport('Total Upload: 65 MiB / gzip: 1 MiB'),/worker_script_size_exceeded/);assert.throws(()=>workerBundleReport('No upload report'),/worker_bundle_report_required/);
});
