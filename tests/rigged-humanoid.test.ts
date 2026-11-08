import '../scripts/node-platform.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Bone,SkinnedMesh,Vector3 } from 'three';
import { buildHumanoid,buildSavedHumanoid } from '../src/rigging/build.ts';
import { humanoidRecipe } from '../examples/recipes/stylized-humanoid/index.ts';
import { inspectGeometry } from '../src/lantern/inspect.ts';

test('humanoid builds genuine bound skin and meaningful proportional shapes',()=>{
  for(const parameters of [{},{height:1.2,headRatio:.22,shoulderRatio:.32,hipRatio:.24,legRatio:.43,armRatio:.32,limbRatio:.065},{height:2.2,headRatio:.14,shoulderRatio:.22,hipRatio:.16,legRatio:.53,armRatio:.4,limbRatio:.035}]){
    const build=buildHumanoid(parameters);
    try{
      assert.equal(build.rig.bones.length,20);assert.equal(build.root.animations.length,2);
      assert.deepEqual(inspectGeometry(build.root).errors,[]);assert.ok(Math.abs(build.dimensions.y-(parameters.height??1.7))<1e-5);
      let meshes=0,blended=0;
      build.root.traverse(object=>{if(!(object instanceof SkinnedMesh))return;meshes++;
        const position=object.geometry.getAttribute('position'),weights=object.geometry.getAttribute('skinWeight'),indices=object.geometry.getAttribute('skinIndex');
        for(let i=0;i<position.count;i++){
          let sum=0,active=0;for(let k=0;k<4;k++){const w=weights.getComponent(i,k);assert.ok(w>=0&&Number.isFinite(w));sum+=w;if(w>0)active++;assert.ok(indices.getComponent(i,k)<20);}
          assert.ok(Math.abs(sum-1)<1e-6);if(active>1)blended++;
          assert.ok(object.getVertexPosition(i,new Vector3()).distanceTo(new Vector3().fromBufferAttribute(position,i))<1e-5);
        }
      });assert.ok(meshes>0&&meshes<=8);assert.ok(blended>50);
      assert.deepEqual(humanoidRecipe.load(JSON.parse(JSON.stringify(build.config))),build.config);
    }finally{build.dispose();build.dispose();}
  }
  const narrow=buildHumanoid({shoulderRatio:.22}),wide=buildHumanoid({shoulderRatio:.32});try{assert.ok(wide.dimensions.x>narrow.dimensions.x+.1);}finally{narrow.dispose();wide.dispose();}
  for(const value of [{height:0},{legRatio:.99},{extra:1},{'color.skin':'red'},{height:NaN}])assert.throws(()=>buildHumanoid(value));
});

test('continuous weighted knee vertices deform and appearance keeps skin attributes',()=>{
  for(const shading of ['None','Flat','Toon3bands'] as const){
    const build=buildHumanoid({appearance:{version:1,palette:'None',shading,partColors:{}}});
    try{
      const mesh=build.root.getObjectByName('humanoid-body') as SkinnedMesh,positions=mesh.geometry.getAttribute('position'),weights=mesh.geometry.getAttribute('skinWeight'),indices=mesh.geometry.getAttribute('skinIndex');
      const knee=build.root.getObjectByName('shin_l')!,boneIndex=mesh.skeleton.bones.indexOf(knee as Bone);
      const blended:number[]=[];for(let i=0;i<positions.count;i++)if(indices.getX(i)===boneIndex&&weights.getX(i)>.05&&weights.getX(i)<.95)blended.push(i);
      assert.ok(blended.length>8);const before=blended.map(i=>mesh.getVertexPosition(i,new Vector3()));knee.rotation.x=.8;build.root.updateMatrixWorld(true);mesh.skeleton.update();
      const displacement=blended.map((i,j)=>mesh.getVertexPosition(i,new Vector3()).distanceTo(before[j]!));assert.ok(Math.max(...displacement)>.005);assert.ok(mesh.geometry.getAttribute('skinIndex'));assert.ok(mesh.geometry.getAttribute('skinWeight'));
    }finally{build.dispose();}
  }
});


test('humanoid saved designs retain appearance and reject forged canonical fields',()=>{
  const build=buildHumanoid({headRatio:.2,appearance:{version:1,palette:'PICO8',shading:'Flat',partColors:{'humanoid-tunic':'#223344'}}});
  try{const copy=buildSavedHumanoid(JSON.parse(JSON.stringify(build.config)));try{assert.deepEqual(copy.config,build.config);}finally{copy.dispose();}
    for(const patch of [{applied:{}},{familyVersion:'9.0.0'},{unknown:1},{migration:{fromVersion:'0.0.0'}}])assert.throws(()=>buildSavedHumanoid({...build.config,...patch}));
  }finally{build.dispose();}
});

