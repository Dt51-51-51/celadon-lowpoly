import '../scripts/node-platform.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { SkinnedMesh } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { validateBytes } from 'gltf-validator';
import { buildAsset,disposeAsset,loadDesign } from '../src/catalog/index.ts';
import { buildRecipeAsset } from '../src/catalog/build.ts';
import { recipe } from '../src/recipes/index.ts';
import { validateRigMotion } from '../src/rigging/validation.ts';
import type { RiggedAssetBuild } from '../src/rigging/types.ts';
import { buildDesignSnapshot } from '../src/studio/design-snapshot.ts';
import { modelStyle } from '../src/site/discovery.ts';
import { assertSameBytes } from './same-bytes.ts';

for(const family of ['stylized-humanoid','stylized-fox']){
 test(family+' catalog edits and GLB export retain bound skins and clips',async()=>{
  const {exportDeliverable}=await import('../src/catalog/delivery.ts');
  assert.equal(modelStyle(family),'faceted-low-poly');
  for(const parameters of [{},family==='stylized-humanoid'?{height:1.9}:{bodyLength:.6}]){
   const build=buildAsset(family,parameters) as RiggedAssetBuild;
   try{
    validateRigMotion(build.root,build.rig);assert.deepEqual(build.root.animations.map(clip=>clip.name),['idle','walk']);
    const saved=loadDesign(JSON.parse(JSON.stringify(build.config))),snapshot=buildDesignSnapshot(saved) as RiggedAssetBuild;
    try{
     assert.deepEqual(snapshot.config,build.config);
     const bytes=await exportDeliverable(snapshot),validation=await validateBytes(bytes);
     assert.equal(validation.issues.numErrors,0);assert.equal(validation.issues.numWarnings,0);
     assertSameBytes(bytes,await exportDeliverable(snapshot),'repeat export');
     const gltf=await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer,'');
     assert.deepEqual(gltf.animations.map(clip=>clip.name),['idle','walk']);let skins=0;
     gltf.scene.traverse(object=>{if(object instanceof SkinnedMesh){skins++;assert.equal(object.skeleton.bones.length,build.rig.bones.length);assert.equal(object.geometry.getAttribute('position').count,object.geometry.getAttribute('skinWeight').count);object.geometry.dispose();object.skeleton.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});
     assert.equal(skins,build.rig.meshes.length);
    }finally{disposeAsset(snapshot);}
   }finally{disposeAsset(build);build.dispose();}
  }
 });
 test(family+' appearance preserves skin attributes and cleanup has one owner',()=>{
  for(const shading of ['None','Flat','Toon3bands']){
   const build=buildAsset(family,{appearance:{version:1,palette:'PICO8',shading,partColors:{}}}) as RiggedAssetBuild;
   validateRigMotion(build.root,build.rig);
   const counts:number[]=[],seen=new Set<object>();
   build.root.traverse(object=>{if(!(object instanceof SkinnedMesh))return;
    for(const resource of [object.geometry,object.skeleton,...(Array.isArray(object.material)?object.material:[object.material])]){
     if(seen.has(resource))continue;seen.add(resource);const slot=counts.length;counts.push(0);const dispose=resource.dispose.bind(resource);resource.dispose=()=>{counts[slot]=counts[slot]!+1;dispose();};
    }
   });
   disposeAsset(build);build.dispose();disposeAsset(build);assert.ok(counts.length>0);assert.ok(counts.every(count=>count===1));
  }
 });
 test(family+' shared styling failure releases the complete rig',()=>{
  const build=buildAsset(family) as RiggedAssetBuild,mesh=build.root.getObjectByName(build.rig.meshes[0]!) as SkinnedMesh;
  let skeletonDisposals=0;const dispose=mesh.skeleton.dispose.bind(mesh.skeleton);mesh.skeleton.dispose=()=>{skeletonDisposals++;dispose();};
  mesh.material=[Array.isArray(mesh.material)?mesh.material[0]!:mesh.material];
  assert.throws(()=>buildRecipeAsset({...recipe(family),build:()=>build},{appearance:{version:1,palette:'PICO8',shading:'Flat',partColors:{}}}),/single material/);
  disposeAsset(build);assert.equal(skeletonDisposals,1);
 });
}
