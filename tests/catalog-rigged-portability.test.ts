import '../scripts/node-platform.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir,mkdtemp } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildSourcePackages } from '../scripts/recipe-package.ts';
import { extractPackage } from '../scripts/recipe-check.ts';
import { sha256 } from '../scripts/recipe-package-core.ts';
import { buildAsset,disposeAsset,descriptor } from '../src/catalog/index.ts';
import { exportDeliverable } from '../src/catalog/delivery.ts';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SkinnedMesh } from 'three';
import { assertSameBytes } from './same-bytes.ts';

test('fresh portable rig sources rebuild defaults and edited designs with unchanged skins and clips',{timeout:180000},async()=>{
 const base=resolve('evidence/rigged-catalog');await mkdir(base,{recursive:true});const output=await mkdtemp(join(base,'portable-'));
 const index=await buildSourcePackages(join(output,'candidate'),['stylized-humanoid','stylized-fox'],3),rows=[];
 for(const entry of index.packages){
  const directory=join(output,entry.id),archive=await readFile(join(output,'candidate',entry.url.split('/').at(-1)!));await extractPackage(archive,directory);
  const install=spawnSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:directory,encoding:'utf8',timeout:60000});
  await writeFile(join(directory,'installation.log'),install.stdout+install.stderr);assert.equal(install.status,0,install.stdout+install.stderr);
  for(const [mode,parameters] of [['default',{}],['custom',entry.id==='stylized-humanoid'?{height:1.9}:{bodyLength:.6}]] as const){
   const design=descriptor(entry.id).save(parameters);await writeFile(join(directory,'selected.json'),JSON.stringify(design));
   const run=spawnSync('npm',['run','rebuild','--','--config','selected.json','--out',mode+'.glb'],{cwd:directory,encoding:'utf8',timeout:60000});
   await writeFile(join(directory,mode+'.log'),run.stdout+run.stderr);assert.equal(run.status,0,run.stdout+run.stderr);
   const bytes=await readFile(join(directory,mode+'.glb')),report=JSON.parse(await readFile(join(directory,mode+'.glb.report.json'),'utf8')),build=buildAsset(entry.id,parameters);
   try{assert.deepEqual(report.config,build.config);assert.equal(report.source.matchesPackagedSource,true);assertSameBytes(bytes,await exportDeliverable(build),'portable rebuild');}finally{disposeAsset(build);}
   const baseline=await readFile(resolve('tests/fixtures','rig-'+(entry.id==='stylized-humanoid'?'humanoid':'fox')+'-'+mode+'-before.glb'));assertSameBytes(bytes,baseline,'rig baseline');
   const gltf=await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer,'');assert.deepEqual(gltf.animations.map(clip=>clip.name),['idle','walk']);let skins=0;
   gltf.scene.traverse(object=>{if(object instanceof SkinnedMesh){skins++;object.geometry.dispose();object.skeleton.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});assert.ok(skins>0);
   rows.push({id:entry.id,mode,bytes:bytes.length,sha256:sha256(bytes),baselineUnchanged:true,skins,clips:gltf.animations.map(clip=>clip.name)});
  }
 }
 await writeFile(join(output,'receipt.json'),JSON.stringify({node:process.versions.node,index,rows},null,2)+'\n');
});
