import '../scripts/node-platform.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,readFile,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildAgentBundle } from '../scripts/agent-bundle.ts';
import { buildSourcePackages } from '../scripts/recipe-package.ts';
import { installBundle } from '../integrations/agents/polyspoon/install.mjs';
import { sha256 } from '../scripts/recipe-package-core.ts';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SkinnedMesh } from 'three';
import { validateBytes } from 'gltf-validator';
import { descriptor } from '../src/catalog/index.ts';
import { assertSameBytes } from './same-bytes.ts';

test('agent 3 fresh install bootstraps every recipe and exports edited animated rigs',{timeout:180000},async()=>{
 const base=resolve('evidence/rigged-catalog');await mkdir(base,{recursive:true});const output=await mkdtemp(join(base,'agent3-'));
 const oldBytes=await readFile('public/agent-bundles/polyspoon-agent-2.zip'),packages=join(output,'source');await buildSourcePackages(packages,['bench'],3);
 const directory=join(output,'bundle'),archive=join(output,'polyspoon-agent-3.zip');
 const manifest=await buildAgentBundle({directory,archive,packageDirectory:packages,deliveryRevision:3});assert.equal(manifest.toolkit.deliveryRevision,3);
 const project=join(output,'project');await mkdir(project);await installBundle({bundle:directory,project,app:'codex'});
 const run=(file:string,args:string[])=>{const p=spawnSync(process.execPath,[join(project,'.polyspoon',file),...args],{cwd:project,encoding:'utf8',timeout:120000});assert.equal(p.status,0,p.stdout+p.stderr);return p;};
 const bootstrap=run('bootstrap.mjs',[]);await writeFile(join(output,'bootstrap.log'),bootstrap.stdout+bootstrap.stderr);
 const catalog=JSON.parse(run('runtime.mjs',['catalog']).stdout);assert.equal(catalog.length,20);const rows=[];
 for(const family of ['stylized-humanoid','stylized-fox']){
  const parameters=family==='stylized-humanoid'?{height:1.9}:{bodyLength:.6},first=join(project,family),edited=join(project,family+'-edited');
  run('runtime.mjs',['build','--family',family,'--parameters',JSON.stringify(parameters),'--out',first]);
  run('runtime.mjs',['build','--config',join(first,'asset.design.json'),'--out',edited]);
  const bytes=await readFile(join(edited,'asset.glb'));assertSameBytes(bytes,await readFile(join(first,'asset.glb')),'edited rebuild');
  const baseline=await readFile(join(base,(family==='stylized-humanoid'?'humanoid':'fox')+'-custom-before.glb'));assertSameBytes(bytes,baseline,'rig baseline');
  const validation=await validateBytes(bytes);assert.equal(validation.issues.numErrors,0);assert.equal(validation.issues.numWarnings,0);
  const gltf=await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer,'');assert.deepEqual(gltf.animations.map(clip=>clip.name),['idle','walk']);let skins=0;
  gltf.scene.traverse(object=>{if(object instanceof SkinnedMesh){skins++;object.geometry.dispose();object.skeleton.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});assert.ok(skins>0);
  const repeated=spawnSync(process.execPath,[join(project,'.polyspoon/runtime.mjs'),'build','--family',family,'--out',edited],{cwd:project,encoding:'utf8'});assert.notEqual(repeated.status,0);assert.deepEqual(await readFile(join(edited,'asset.glb')),bytes);
  const changed=descriptor(family).save(family==='stylized-humanoid'?{height:2}:{bodyLength:.65});changed.appearance={version:1,palette:'PICO8',shading:'Flat',partColors:{}};
  const changedPath=join(project,family+'-changed.design.json'),restyled=join(project,family+'-restyled');await writeFile(changedPath,JSON.stringify(changed));
  run('runtime.mjs',['build','--config',changedPath,'--out',restyled]);const restyledBytes=await readFile(join(restyled,'asset.glb')),restyledDesign=JSON.parse(await readFile(join(restyled,'asset.design.json'),'utf8'));assert.deepEqual(restyledDesign,changed);assert.notEqual(sha256(restyledBytes),sha256(bytes));
  const restyledValidation=await validateBytes(restyledBytes);assert.equal(restyledValidation.issues.numErrors,0);assert.equal(restyledValidation.issues.numWarnings,0);
  const imported=await new GLTFLoader().parseAsync(Uint8Array.from(restyledBytes).buffer,'');assert.deepEqual(imported.animations.map(clip=>clip.name),['idle','walk']);let restyledSkins=0;
  imported.scene.traverse(object=>{if(object instanceof SkinnedMesh){restyledSkins++;assert.equal(object.geometry.getAttribute('skinIndex').count,object.geometry.getAttribute('position').count);object.geometry.dispose();object.skeleton.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});assert.equal(restyledSkins,skins);
  rows.push({family,skins,clips:gltf.animations.map(clip=>clip.name),sha256:sha256(bytes),baselineByteIdentical:true,restyledSha256:sha256(restyledBytes),restyledDesign,restyledSkins});
 }
 assert.deepEqual(await readFile('public/agent-bundles/polyspoon-agent-2.zip'),oldBytes);
 await writeFile(join(output,'receipt.json'),JSON.stringify({manifest,archiveSha256:sha256(await readFile(archive)),oldAgent2Sha256:sha256(oldBytes),catalog:catalog.map((item:{id:string})=>item.id),rows},null,2)+'\n');
});
