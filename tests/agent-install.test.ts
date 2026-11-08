import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildAgentBundle} from '../scripts/agent-bundle.ts';
import {installBundle} from '../integrations/agents/polyspoon/install.mjs';
import {extractStored} from '../integrations/agents/polyspoon/support.mjs';

const temporary=()=>mkdtemp(join(tmpdir(),'polyspoon-agent-'));
test('one bundle installs explicit project adapters and repeat updates preserve local changes',async()=>{
 const temp=await temporary(),bundle=join(temp,'bundle');
 await buildAgentBundle({directory:bundle,archive:join(temp,'agent.zip')});
 const extracted=join(temp,'archive-extracted');await extractStored(await readFile(join(temp,'agent.zip')),extracted);
 const fallbackProject=join(temp,'fallback-project');await mkdir(fallbackProject);const cli=spawnSync(process.execPath,[join(extracted,'install.mjs'),'--app','codex','--project',fallbackProject],{encoding:'utf8'});assert.equal(cli.status,0,cli.stderr);
 for(const [app,folder] of [['codex','.agents'],['claude','.claude'],['cursor','.cursor'],['copilot','.github']]){
  const project=join(temp,app!);await mkdir(project);
  await installBundle({bundle,project,app:app!});
  const skill=join(project,folder!,'skills/polyspoon/SKILL.md'),first=await readFile(skill,'utf8');
  assert.ok(first.includes('name: polyspoon'));
  await writeFile(join(project,folder!,'skills/polyspoon/my-notes.md'),'keep me');
  await installBundle({bundle,project,app:app!});assert.equal(await readFile(skill,'utf8'),first);
  const runtime=join(bundle,'runtime.mjs');await writeFile(runtime,(await readFile(runtime,'utf8'))+'\n');
  await assert.rejects(()=>installBundle({bundle,project,app:app!}),/integrity/i);
  await writeFile(runtime,(await readFile(runtime,'utf8')).slice(0,-1));
  const next=Buffer.from(first+'\nUpdated bundle guidance.\n');await writeFile(join(bundle,'SKILL.md'),next);
  const manifest=JSON.parse(await readFile(join(bundle,'bundle.json'),'utf8'));manifest.version='1.1.1';manifest.files['SKILL.md']={sha256:createHash('sha256').update(next).digest('hex'),bytes:next.length};await writeFile(join(bundle,'bundle.json'),JSON.stringify(manifest));
  await installBundle({bundle,project,app:app!});assert.deepEqual(await readFile(skill),next);
  await writeFile(skill,first+'\nlocal changes\n');
  await assert.rejects(()=>installBundle({bundle,project,app:app!}),/conflict/i);
  assert.equal(await readFile(skill,'utf8'),first+'\nlocal changes\n');
  assert.equal(await readFile(join(project,folder!,'skills/polyspoon/my-notes.md'),'utf8'),'keep me');
 }
 await assert.rejects(()=>installBundle({bundle,project:temp,app:'unknown'}),/Unsupported/);
 const project=join(temp,'symlink-project'),outside=join(temp,'outside');await mkdir(project);await mkdir(outside);await symlink(outside,join(project,'.polyspoon'));
 await assert.rejects(()=>installBundle({bundle,project,app:'codex'}),/Symlink/);
});

test('installed bundle bootstraps and builds an actual changed-width bench through the engine',async()=>{
 const temp=await temporary(),bundle=join(temp,'bundle'),project=join(temp,'project');await mkdir(project);
 await buildAgentBundle({directory:bundle,archive:join(temp,'agent.zip')});await installBundle({bundle,project,app:'codex'});
 const invoke=(script:string,args:string[])=>{const p=spawnSync(process.execPath,[join(project,'.polyspoon',script),...args],{cwd:project,encoding:'utf8',timeout:120000});assert.equal(p.status,0,p.stdout+p.stderr);return p;};
 invoke('bootstrap.mjs',[]);await writeFile(join(project,'.polyspoon/toolkit/my-edits.txt'),'preserve editable toolkit');await installBundle({bundle,project,app:'codex'});invoke('bootstrap.mjs',[]);assert.equal(await readFile(join(project,'.polyspoon/toolkit/my-edits.txt'),'utf8'),'preserve editable toolkit');
 const statePath=join(project,'.polyspoon/agent-install.json'),state=JSON.parse(await readFile(statePath,'utf8'));await writeFile(statePath,JSON.stringify({...state,toolkit:{...state.toolkit,sha256:'0'.repeat(64)}}));
 const mismatched=spawnSync(process.execPath,[join(project,'.polyspoon/runtime.mjs'),'catalog'],{cwd:project,encoding:'utf8'});assert.notEqual(mismatched.status,0,'mismatched engine/archive must not run');await writeFile(statePath,JSON.stringify(state));
 const catalog=JSON.parse(invoke('runtime.mjs',['catalog']).stdout);assert.equal(catalog.length,20);
 invoke('runtime.mjs',['build','--family','bench','--parameters','{"width":2.2,"backrest":false}','--out','exports/request-01']);
 const config=JSON.parse(await readFile(join(project,'exports/request-01/asset.design.json'),'utf8'));
 assert.equal(config.applied.width,2.2);assert.equal(config.applied.backrest,false);
 const report=JSON.parse(await readFile(join(project,'exports/request-01/report.json'),'utf8'));
 assert.ok(Math.abs(report.dimensions[0]-2.2)<1e-5);assert.deepEqual(report.geometry.errors,[]);
 const {validateBytes}=await import('gltf-validator');const glb=await readFile(join(project,'exports/request-01/asset.glb'));assert.equal((await validateBytes(glb,{maxIssues:20})).issues.numErrors,0);
 const repeated=spawnSync(process.execPath,[join(project,'.polyspoon/runtime.mjs'),'build','--family','bench','--out','exports/request-01'],{cwd:project,encoding:'utf8'});assert.notEqual(repeated.status,0);assert.deepEqual(await readFile(join(project,'exports/request-01/asset.glb')),glb);
 console.log(JSON.stringify({project,glbSha256:report.glbSha256,dimensions:report.dimensions}));
});
