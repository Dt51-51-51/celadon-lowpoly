import '../scripts/node-platform.ts';
import test from 'node:test';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { AnimationMixer,Bone,Group,LoopOnce,SkinnedMesh,Vector3 } from 'three';
import { buildHumanoid } from '../src/rigging/build.ts';
import { solveTwoBone,applyTwoBone } from '../src/rigging/ik.ts';
import { createHumanoidMotion } from '../src/rigging/motion.ts';

test('two bone IK reaches targets and rejects invalid input without pose changes',()=>{
  const build=buildHumanoid();try{
    const upper=build.root.getObjectByName('thigh_l') as Bone,lower=build.root.getObjectByName('shin_l') as Bone,end=build.root.getObjectByName('foot_l') as Bone;
    build.root.getObjectByName('motion_root')!.position.y=-.05;build.root.updateMatrixWorld(true);
    const target=end.getWorldPosition(new Vector3()).add(new Vector3(0,.01,.05));const pose=solveTwoBone(upper,lower,end,target,new Vector3(0,0,1));applyTwoBone(upper,lower,end,pose);build.root.updateMatrixWorld(true);
    assert.ok(end.getWorldPosition(new Vector3()).distanceTo(target)<1e-7);
    const before=[upper.quaternion.toArray(),lower.quaternion.toArray(),end.quaternion.toArray()];
    for(const bad of [new Vector3(100,100,100),new Vector3(NaN,0,0)])assert.throws(()=>solveTwoBone(upper,lower,end,bad,new Vector3(0,0,1)));
    assert.deepEqual([upper.quaternion.toArray(),lower.quaternion.toArray(),end.quaternion.toArray()],before);
  }finally{build.dispose();}
});

test('idle and walk keep actual skinned soles planted between baked keys',()=>{
  const rows=['input,clip,time,bone,maximumHeightError,maximumDrift'];
  for(const input of [{},{height:1.2,legRatio:.43,limbRatio:.065},{height:2.2,legRatio:.53,limbRatio:.035}]){
    const build=buildHumanoid(input);try{
      createHumanoidMotion(build);assert.deepEqual(build.root.animations.map(clip=>clip.name),['idle','walk']);
      const mesh=build.root.getObjectByName('humanoid-body') as SkinnedMesh,position=mesh.geometry.getAttribute('position'),indices=mesh.geometry.getAttribute('skinIndex'),weights=mesh.geometry.getAttribute('skinWeight');
      for(const declaration of build.rig.clips){
        const mixer=new AnimationMixer(build.root),clip=build.root.animations.find(clip=>clip.name===declaration.name)!,action=mixer.clipAction(clip);action.setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();
        const references=new Map<string,Vector3[]>();
        for(let step=0;step<=240;step++){
          const time=clip.duration*step/240;mixer.setTime(time);build.root.updateMatrixWorld(true);mesh.skeleton.update();
          for(const contact of declaration.contacts){if(time<contact.start+1e-6||time>contact.end-1e-6)continue;
            const foot=mesh.skeleton.bones.findIndex(bone=>bone.name===contact.bone),toe=mesh.skeleton.bones.findIndex(bone=>bone.name===contact.bone.replace('foot_','toe_')),points:Vector3[]=[];
            for(let i=0;i<position.count;i++)if(Math.abs(position.getY(i))<1e-8&&[0,1,2,3].every(k=>weights.getComponent(i,k)===0||[foot,toe].includes(indices.getComponent(i,k))))points.push(mesh.getVertexPosition(i,new Vector3()));
            assert.ok(points.length>=6);const key=contact.bone+'-'+contact.start;if(!references.has(key))references.set(key,points.map(point=>point.clone()));
            rows.push([Object.entries(input).map(([key,value])=>key+'='+value).join(';')||'default',declaration.name,time,contact.bone,Math.max(...points.map(point=>Math.abs(point.y))),Math.max(...points.map((point,i)=>point.distanceTo(references.get(key)![i]!)))].join(','));
            points.forEach((point,i)=>{assert.ok(Math.abs(point.y)<=.005,`${declaration.name}/${time}: soleY${point.y}`);assert.ok(point.distanceTo(references.get(key)![i]!)<=.005,`${declaration.name}/${time}: drift`);});
          }
        }
        const root=build.root.getObjectByName('motion_root')!;assert.ok(Math.abs(root.position.z-declaration.rootDelta[2])<1e-5);mixer.stopAllAction();mixer.uncacheRoot(build.root);
      }
    }finally{build.dispose();}
  }
  writeFileSync('evidence/rigged-humanoid/contact-samples.csv',rows.join('\n')+'\n');
});

test('root displacement accumulation preserves world motion across a walk loop',()=>{
  const build=buildHumanoid();try{
    const holder=new Group();holder.add(build.root);
    const mixer=new AnimationMixer(build.root),clip=build.root.animations.find(clip=>clip.name==='walk')!,delta=build.rig.clips.find(clip=>clip.name==='walk')!.rootDelta;
    mixer.addEventListener('loop',event=>holder.position.addScaledVector(new Vector3(...delta),event.loopDelta));mixer.clipAction(clip).play();
    mixer.update(clip.duration-.001);holder.updateMatrixWorld(true);const bone=build.root.getObjectByName('motion_root')!,before=bone.getWorldPosition(new Vector3());
    mixer.update(.002);holder.updateMatrixWorld(true);const after=bone.getWorldPosition(new Vector3());assert.ok(after.z>=before.z);assert.ok(after.distanceTo(before)<.005);assert.ok(holder.position.z>.4);
    mixer.stopAllAction();mixer.uncacheRoot(build.root);
  }finally{build.dispose();}
});

test('walk keeps a mild stance knee bend through sampled and interpolated phases',()=>{
  for(const input of [{},{height:1.2,legRatio:.43,limbRatio:.065},{height:2.2,legRatio:.53,limbRatio:.035}]){
    const build=buildHumanoid(input);try{
      const clip=build.root.animations.find(clip=>clip.name==='walk')!,declaration=build.rig.clips.find(clip=>clip.name==='walk')!,mixer=new AnimationMixer(build.root),action=mixer.clipAction(clip);action.setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();
      for(let i=1;i<240;i++){
        const time=clip.duration*i/240;mixer.setTime(time);build.root.updateMatrixWorld(true);
        for(const contact of declaration.contacts){if(time<contact.start||time>contact.end)continue;const chain=build.rig.chains.find(chain=>chain.end===contact.bone)!,a=build.root.getObjectByName(chain.upper)!.getWorldPosition(new Vector3()),b=build.root.getObjectByName(chain.lower)!.getWorldPosition(new Vector3()),c=build.root.getObjectByName(chain.end)!.getWorldPosition(new Vector3()),bend=b.clone().sub(a).angleTo(c.clone().sub(b))*180/Math.PI;assert.ok(bend<=28,`${JSON.stringify(input)}/${time}: stance knee ${bend}`);}
      }
      mixer.stopAllAction();mixer.uncacheRoot(build.root);
    }finally{build.dispose();}
  }
});
