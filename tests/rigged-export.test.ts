import '../scripts/node-platform.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { AnimationMixer,LoopOnce,SkinnedMesh,Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { validateBytes } from 'gltf-validator';
import { buildHumanoid } from '../src/rigging/build.ts';
import { exportRiggedAsset } from '../src/rigging/export.ts';
import { validateRig } from '../src/rigging/validation.ts';
import { buildAsset,disposeAsset } from '../src/catalog/index.ts';
import { exportAsset } from '../src/catalog/export.ts';

test('real animated GLB imports skins and plays contact motion between keys',async()=>{
  const build=buildHumanoid();try{
    const bytes=await exportRiggedAsset(build),validation=await validateBytes(bytes);assert.equal(validation.issues.numErrors,0,JSON.stringify(validation.issues));assert.equal(validation.issues.numWarnings,0,JSON.stringify(validation.issues));assert.deepEqual(bytes,await exportRiggedAsset(build));
    const gltf=await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer,''),root=gltf.scene.getObjectByName('stylized-humanoid')!;assert.equal(gltf.animations.length,2);
    const mesh=root.getObjectByName('humanoid-body') as SkinnedMesh;assert.ok(mesh.isSkinnedMesh);assert.equal(mesh.skeleton.bones.length,20);
    const position=mesh.geometry.getAttribute('position'),indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');
    const mixer=new AnimationMixer(root),walk=gltf.animations.find(clip=>clip.name==='walk')!,action=mixer.clipAction(walk);action.setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();
    const references=new Map<string,Vector3[]>();
    for(let i=1;i<240;i++){
      const time=walk.duration*i/240;mixer.setTime(time);gltf.scene.updateMatrixWorld(true);mesh.skeleton.update();const side=time<walk.duration/2?'l':'r',foot=mesh.skeleton.bones.findIndex(bone=>bone.name==='foot_'+side),toe=mesh.skeleton.bones.findIndex(bone=>bone.name==='toe_'+side),points:Vector3[]=[];
      for(let v=0;v<position.count;v++)if(Math.abs(position.getY(v))<1e-8&&[0,1,2,3].every(k=>weights.getComponent(v,k)===0||[foot,toe].includes(indices.getComponent(v,k))))points.push(mesh.getVertexPosition(v,new Vector3()));
      assert.ok(points.length>=6);if(!references.has(side))references.set(side,points.map(p=>p.clone()));for(let v=0;v<points.length;v++){assert.ok(Math.abs(points[v]!.y)<=.005);assert.ok(points[v]!.distanceTo(references.get(side)![v]!)<=.005);}
    }
    assert.deepEqual(root.userData.openpolyRig,build.rig);mixer.stopAllAction();mixer.uncacheRoot(root);gltf.scene.traverse(object=>{if(object instanceof SkinnedMesh){object.geometry.dispose();object.skeleton.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});
  }finally{build.dispose();}
});

test('animated validation rejects broken weights, bones and clips',async()=>{
  for(const corrupt of [
    (build:ReturnType<typeof buildHumanoid>)=>{(build.root.getObjectByName('humanoid-body') as SkinnedMesh).geometry.getAttribute('skinWeight').setX(0,-1);},
    (build:ReturnType<typeof buildHumanoid>)=>{build.rig.bones[1]!.parent='missing';},
    (build:ReturnType<typeof buildHumanoid>)=>{build.root.animations[0]!.tracks[0]!.name='missing.position';},
    (build:ReturnType<typeof buildHumanoid>)=>{build.root.animations=[];},
    (build:ReturnType<typeof buildHumanoid>)=>{(build.root.getObjectByName('humanoid-body') as SkinnedMesh).geometry.getAttribute('position').setY(0,NaN);},
  ]){const build=buildHumanoid();try{corrupt(build);await assert.rejects(exportRiggedAsset(build));}finally{build.dispose();}}
  const build=buildHumanoid();try{validateRig(build.root,build.rig);}finally{build.dispose();}
});

test('existing exporter and static exports remain unchanged',async()=>{
  const expected='5473a5611be3ef728adbdaf57a597d224dcee4b716950cc89c732315f872346d';assert.equal(createHash('sha256').update(await readFile('src/catalog/export.ts')).digest('hex'),expected);
  const before=buildAsset('bench'),after=buildAsset('bench');try{assert.deepEqual(await exportAsset(before),await exportAsset(after));}finally{disposeAsset(before);disposeAsset(after);}
});

test('portable faceted normals split corners without changing skin, binds, clips or source geometry',async()=>{
  const build=buildHumanoid();try{
    type SourceGeometry={geometry:import('three').BufferGeometry;positions:number[];normals:number[];disposed:boolean};
    const original=new Map<string,SourceGeometry>();
    build.root.traverse(object=>{if(object instanceof SkinnedMesh){const record:SourceGeometry={geometry:object.geometry,positions:Array.from(object.geometry.getAttribute('position').array),normals:Array.from(object.geometry.getAttribute('normal').array),disposed:false};original.set(object.name,record);object.geometry.addEventListener('dispose',()=>{record.disposed=true;});}});
    const bytes=await exportRiggedAsset(build),gltf=await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer,'');gltf.scene.updateMatrixWorld(true);
    for(const [name,source] of original){
      const imported=gltf.scene.getObjectByName(name) as SkinnedMesh,geometry=imported.geometry,p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),indices=geometry.index,expected=source.geometry.index?.count??source.geometry.getAttribute('position').count;
      assert.equal(p.count,expected);assert.equal(geometry.getAttribute('skinIndex').count,p.count);assert.equal(geometry.getAttribute('skinWeight').count,p.count);
      for(let corner=0;corner<expected;corner+=3){const slots=[0,1,2].map(k=>indices?indices.getX(corner+k):corner+k),a=new Vector3().fromBufferAttribute(p,slots[0]!),b=new Vector3().fromBufferAttribute(p,slots[1]!),c=new Vector3().fromBufferAttribute(p,slots[2]!),face=b.sub(a).cross(c.sub(a)).normalize();for(const slot of slots)assert.ok(new Vector3().fromBufferAttribute(n,slot).dot(face)>1-1e-5);}
      for(let corner=0;corner<expected;corner++){
        const originalSlot=source.geometry.index?.getX(corner)??corner,importedSlot=indices?.getX(corner)??corner;
        for(const attribute of ['position','skinIndex','skinWeight']){const from=source.geometry.getAttribute(attribute),to=geometry.getAttribute(attribute);for(let k=0;k<from.itemSize;k++)assert.equal(to.getComponent(importedSlot,k),from.getComponent(originalSlot,k));}
      }
      const sourceMesh=build.root.getObjectByName(name) as SkinnedMesh;for(let bone=0;bone<imported.skeleton.boneInverses.length;bone++)for(let component=0;component<16;component++)assert.ok(Math.abs(imported.skeleton.boneInverses[bone]!.elements[component]!-sourceMesh.skeleton.boneInverses[bone]!.elements[component]!)<1e-6);
      assert.equal(source.disposed,false);assert.equal(sourceMesh.geometry,source.geometry);assert.deepEqual(Array.from(sourceMesh.geometry.getAttribute('position').array),source.positions);assert.deepEqual(Array.from(sourceMesh.geometry.getAttribute('normal').array),source.normals);
    }
    for(const clip of build.root.animations){const imported=gltf.animations.find(item=>item.name===clip.name)!;for(const track of clip.tracks){const retained=imported.tracks.find(item=>item.name===track.name)!;assert.deepEqual(Array.from(retained.times),Array.from(track.times));assert.deepEqual(Array.from(retained.values),Array.from(track.values));}}
    gltf.scene.traverse(object=>{if(object instanceof SkinnedMesh){object.geometry.dispose();object.skeleton.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});
  }finally{build.dispose();}
});
