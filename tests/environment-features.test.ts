import '../scripts/node-platform.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh,Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { validateBytes } from 'gltf-validator';
import { terrainParameters,loadEnvironment,saveEnvironment,buildEnvironment,createSurface,exportEnvironment } from '../src/environment/index.ts';
import { assertSameBytes } from './same-bytes.ts';

const base=()=>({formatVersion:1,terrain:terrainParameters({cells:8,seed:17}),tiles:[{x:-1,z:0},{x:0,z:0}],placements:[],roads:[{id:'track',width:1.5,path:[{x:-6,z:3},{x:6,z:3}]}],water:[] as unknown[]});

test('legacy scenes normalize optional surface features',()=>{
  const {roads,water,...legacy}=base();
  const loaded=loadEnvironment(legacy);
  assert.deepEqual(loaded.roads,[]);assert.deepEqual(loaded.water,[]);
  assert.equal(saveEnvironment(loaded),saveEnvironment(JSON.parse(saveEnvironment(loaded))));
});

test('joined roads cross the tile seam and follow terrain inside each exported triangle',async()=>{
  const input=base();input.roads[0]!.path=[{x:-6,z:2},{x:0,z:3},{x:6,z:5}];
  const build=buildEnvironment(input);
  try{
    const mesh=build.root.getObjectByName('road-track') as Mesh;
    assert.ok(mesh?.isMesh);
    const positions=mesh.geometry.getAttribute('position'),surface=createSurface(input.terrain);
    let seam=false;
    for(let i=0;i<positions.count;i+=3){
      for(const weights of [[1,0,0],[0,1,0],[0,0,1],[.2,.3,.5]]){
        let x=0,y=0,z=0;
        for(let k=0;k<3;k++){x+=positions.getX(i+k)*weights[k]!;y+=positions.getY(i+k)*weights[k]!;z+=positions.getZ(i+k)*weights[k]!;}
        x+=mesh.position.x;z+=mesh.position.z;
        if(Math.abs(x)<1e-7)seam=true;
        assert.ok(Math.abs(y-surface.sample(x,z).height-.015)<1e-5,`${x},${z}: ${y}`);
      }
    }
    assert.ok(seam);
    const bytes=await exportEnvironment(build),report=await validateBytes(bytes);
    assert.equal(report.issues.numErrors,0);assert.equal(report.issues.numWarnings,0);
    assertSameBytes(bytes,await exportEnvironment(build),'repeat export');
    const gltf=await new GLTFLoader().parseAsync(Uint8Array.from(bytes).buffer,'');gltf.scene.updateMatrixWorld(true);
    const exported=gltf.scene.getObjectByName('road-track') as Mesh,attribute=exported.geometry.getAttribute('position');
    for(let i=0;i<attribute.count;i+=3){
      const p=new Vector3();for(let k=0;k<3;k++)p.add(new Vector3().fromBufferAttribute(attribute,i+k).applyMatrix4(exported.matrixWorld).multiplyScalar(1/3));
      assert.ok(Math.abs(p.y-surface.sample(p.x,p.z).height-.015)<1e-5);
    }
    const metadata=gltf.scene.getObjectByName('environment')!.userData.environment;assert.deepEqual(metadata.roads,build.config.roads);
    gltf.scene.traverse(object=>{if(object instanceof Mesh){object.geometry.dispose();for(const material of Array.isArray(object.material)?object.material:[object.material])material.dispose();}});
  }finally{build.dispose();}
});

test('roads reject unsupported and invalid ribbon geometry',()=>{
  for(const change of [
    {width:0},{path:[{x:1,z:2}]},{path:[{x:1,z:2},{x:1,z:2}]},
    {path:[{x:-10,z:3},{x:6,z:3}]},{path:[{x:-6,z:3},{x:6,z:3},{x:-5,z:3}]},
  ]){const input=base();Object.assign(input.roads[0]!,change);assert.throws(()=>buildEnvironment(input));}
  const missing=base();missing.tiles=[{x:-1,z:0}];assert.throws(()=>buildEnvironment(missing));
});

test('water is flat, clipped to the shoreline and roundtrips canonically',async()=>{
  const input=base();input.roads=[];
  const surface=createSurface(input.terrain),level=surface.sample(0,4).height;
  input.water=[{id:'pond',x:0,z:4,width:8,depth:4,elevation:level}];
  const build=buildEnvironment(input);
  try{
    const mesh=build.root.getObjectByName('water-pond') as Mesh;assert.ok(mesh?.isMesh);
    const positions=mesh.geometry.getAttribute('position');let shore=false;
    for(let i=0;i<positions.count;i++){
      assert.ok(Math.abs(positions.getY(i)-level)<1e-6);
      const height=surface.sample(positions.getX(i)+mesh.position.x,positions.getZ(i)+mesh.position.z).height;
      assert.ok(height<=level+1e-5);if(Math.abs(height-level)<1e-5)shore=true;
    }
    assert.ok(shore);assert.equal(saveEnvironment(build.config),saveEnvironment(JSON.parse(saveEnvironment(build.config))));
    const bytes=await exportEnvironment(build),report=await validateBytes(bytes);assert.equal(report.issues.numErrors,0);
    assertSameBytes(bytes,await exportEnvironment(build),'repeat export');
  }finally{build.dispose();}
  for(const change of [{elevation:-20},{width:0},{x:100},{depth:Infinity}]){
    const invalid=structuredClone(input);Object.assign(invalid.water[0] as object,change);assert.throws(()=>buildEnvironment(invalid));
  }
});

test('features reject malformed schemas, intersecting paths, gaps and dry water',()=>{
  const input=base();
  for(const changes of [{roads:null},{water:null},{roads:Array(9).fill(input.roads[0])},{roads:[input.roads[0],input.roads[0]]},{water:[{id:'pond',x:0,z:4,width:2,depth:2,elevation:0,unknown:1}]}])assert.throws(()=>loadEnvironment({...input,...changes}));
  input.roads[0]!.path=[{x:-5,z:2},{x:4,z:6},{x:-5,z:6},{x:4,z:2}];assert.throws(()=>buildEnvironment(input),/intersects|sharp/);
  const gap=base();gap.tiles=[{x:-1,z:0},{x:1,z:0}];gap.roads[0]!.path=[{x:-5,z:3},{x:12,z:3}];assert.throws(()=>buildEnvironment(gap),/outside/);
  gap.roads=[];gap.water=[{id:'pond',x:2,z:4,width:16,depth:2,elevation:10}];assert.throws(()=>buildEnvironment(gap),/outside/);
});

test('large world positions preserve road surface agreement with local mesh coordinates',async()=>{
  const input=base();input.tiles=[{x:1023,z:-1024}];input.terrain=terrainParameters({cells:128,cellSize:4,amplitude:12,wavelength:4,seed:34});
  const x=1023*512+200,z=-1024*512+200;input.roads[0]!.path=[{x:x+.37,z:z+.23},{x:x+18.83,z:z+8.87}];input.roads[0]!.width=1.25;
  const build=buildEnvironment(input);
  try{
    const mesh=build.root.getObjectByName('road-track') as Mesh,positions=mesh.geometry.getAttribute('position'),surface=createSurface(input.terrain);
    for(let i=0;i<positions.count;i+=3){
      const p=new Vector3();for(let k=0;k<3;k++)p.add(new Vector3().fromBufferAttribute(positions,i+k).multiplyScalar(1/3));p.add(mesh.position);
      assert.ok(Math.abs(p.y-surface.sample(p.x,p.z).height-.015)<1e-5);
    }
    assert.ok(mesh.geometry.getAttribute('normal').getY(0)>0);
  }finally{build.dispose();}
});


test('explicit selected framing targets asset bounds and leaves placement unchanged',async()=>{
  const { frameEnvironmentObject }=await import('../src/environment/framing.ts');
  const { PerspectiveCamera,Group,BoxGeometry,MeshBasicMaterial,Box3 }=await import('three');
  const asset=new Group(),mesh=new Mesh(new BoxGeometry(.3,.7,.3),new MeshBasicMaterial());asset.position.set(6,2,4);asset.rotation.y=Math.PI/4;asset.add(mesh);
  const camera=new PerspectiveCamera(45,1,.01,2000);camera.position.set(20,20,20);
  const controls={target:new Vector3(),maxDistance:100,update:()=>true};
  const bounds=new Box3().setFromObject(asset),center=bounds.getCenter(new Vector3()),before=asset.matrix.clone();
  assert.equal(frameEnvironmentObject(asset,camera,controls),true);
  assert.ok(controls.target.distanceTo(center)<1e-10);assert.ok(camera.position.distanceTo(center)<2);
  assert.equal(asset.position.x,6);assert.equal(asset.rotation.y,Math.PI/4);assert.deepEqual(asset.matrix,before);
  const position=camera.position.clone(),target=controls.target.clone();assert.equal(frameEnvironmentObject(new Group(),camera,controls),false);
  assert.deepEqual(camera.position,position);assert.deepEqual(controls.target,target);mesh.geometry.dispose();mesh.material.dispose();
});


test('scene and selected framing fit portrait and landscape perspective bounds',async()=>{
  const { frameEnvironmentObject }=await import('../src/environment/framing.ts');
  const { PerspectiveCamera,Group,BoxGeometry,MeshBasicMaterial,Box3 }=await import('three');
  for(const dimensions of [[16,3,16],[.3,.7,.3],[2,12,1]])for(const aspect of [390/464,.3,2])for(const fov of [30,45,70]){
    const object=new Group(),mesh=new Mesh(new BoxGeometry(...dimensions as [number,number,number]),new MeshBasicMaterial());object.add(mesh);object.position.set(6,2,4);object.rotation.y=.7;
    const camera=new PerspectiveCamera(fov,aspect,.01,2000),controls={target:new Vector3(),maxDistance:100,update:()=>true};
    frameEnvironmentObject(object,camera,controls);camera.updateMatrixWorld(true);
    const box=new Box3().setFromObject(object);
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      const projected=new Vector3(x,y,z).project(camera);
      assert.ok(Math.abs(projected.x)<=.850001,`${aspect}/${fov}: x=${projected.x}`);assert.ok(Math.abs(projected.y)<=.850001,`${aspect}/${fov}: y=${projected.y}`);assert.ok(projected.z>=-1&&projected.z<=1);
    }
    const before=camera.position.clone().sub(controls.target).normalize();camera.aspect=.25;frameEnvironmentObject(object,camera,controls,true);
    assert.ok(camera.position.clone().sub(controls.target).normalize().distanceTo(before)<1e-10);
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
      const projected=new Vector3(x,y,z).project(camera);assert.ok(Math.abs(projected.x)<=.850001&&Math.abs(projected.y)<=.850001);
    }
    mesh.geometry.dispose();mesh.material.dispose();
  }
});
