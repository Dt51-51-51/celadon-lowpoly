import { Bone,Box3,Color,Group,MeshStandardMaterial,Skeleton,SkinnedMesh,Vector3 } from 'three';
import { SculptBody } from '../../../src/engine/sculpt/body.ts';
import type { Control,Design } from '../../../src/engine/parameters.ts';
import { parseControls,parameterState,plainRecord } from '../../../src/engine/parameters.ts';
import { loadConstructionDesign } from '../../../src/engine/construction-migration.ts';
import type { Recipe } from '../../../src/recipes/types.ts';
import type { RawRiggedBuild,RigMetadata } from '../../../src/rigging/types.ts';
const ranges=[['bodyLength','Body length',.35,.75,.44],['heightRatio','Shoulder height',.6,.8,.8],['chestRatio','Chest width',.25,.38,.34],['headRatio','Head length',.26,.38,.36],['earRatio','Ear height',.35,.6,.48],['muzzleRatio','Muzzle length',.35,.55,.45],['tailRatio','Tail length',.8,1.2,1.05],['tailFullness','Tail fullness',.1,.18,.16]] as const;
const colors={fur:'#b95b32',cream:'#eadbc4',dark:'#332c2a'};
const controls:Control[]=[...ranges.map(([key,label,min,max,value]):Control=>({key,label,kind:'range',group:'shape',unit:key==='bodyLength'?'m':'ratio',min,max,step:.005,default:value,hint:label,affects:['geometry'],targets:['body','skeleton']})),...Object.entries(colors).map(([role,value]):Control=>({key:'color.'+role,label:role,kind:'color',group:'colors',unit:'color',default:value,role,hint:role+' material',affects:['material'],targets:[role]}))];
function save(input:unknown):Design {const requested={...plainRecord(input)};return {formatVersion:1,family:'stylized-fox',familyVersion:'1.1.0',requested,applied:parseControls(controls,requested)};}
const priorDefaults:Record<string,number>={bodyLength:.5,heightRatio:.72,chestRatio:.3,headRatio:.32,tailFullness:.14};
const priorControls=controls.map((control):Control=>control.kind==='range'||control.kind==='integer'?{...control,default:priorDefaults[control.key]??control.default}:control);
function savePrior(input:unknown):Design {const requested={...plainRecord(input)};return {formatVersion:1,family:'stylized-fox',familyVersion:'1.0.0',requested,applied:parseControls(priorControls,requested)};}
function loadPrior(input:unknown):Design {return loadConstructionDesign(input,'stylized-fox','1.0.0',[],savePrior,()=>{throw new Error('No earlier fox version');});}
function load(input:unknown):Design {return loadConstructionDesign(input,'stylized-fox','1.1.0',['1.0.0'],save,loadPrior);}
function build(input:unknown):RawRiggedBuild {
  const config=save(input),p=config.applied,L=Number(p.bodyLength),H=L*Number(p.heightRatio),W=H*Number(p.chestRatio),headLength=L*Number(p.headRatio),headY=H*1.16,headBack=L*.62,skullLength=headLength*(1-Number(p.muzzleRatio)),tailLength=L*Number(p.tailRatio),tailRadius=L*Number(p.tailFullness),pawY=L*.025;
  const root=new Group();root.name='stylized-fox';const bones:Bone[]=[],byName=new Map<string,Bone>(),points=new Map<string,Vector3>();
  function bone(name:string,point:Vector3,parent?:string){const node=new Bone();node.name=name;points.set(name,point);node.position.copy(point).sub(parent?points.get(parent)!:new Vector3());(parent?byName.get(parent)!:root).add(node);bones.push(node);byName.set(name,node);}
  bone('motion_root',new Vector3());bone('pelvis',new Vector3(0,H*.96,-L*.5),'motion_root');bone('spine',new Vector3(0,H*.98,0),'pelvis');bone('chest',new Vector3(0,H,L*.5),'spine');bone('neck',new Vector3(0,H*1.1,L*.6),'chest');bone('head',new Vector3(0,headY,headBack+skullLength*.35),'neck');
  for(const [suffix,side] of [['l',1],['r',-1]] as const)bone('ear_'+suffix,new Vector3(side*headLength*.23,headY+headLength*.22,headBack+skullLength*.24),'head');
  const tailNames=['tail_base','tail_mid_a','tail_mid_b','tail_tip'],tailTimes=[0,.32,.68,1];
  for(let i=0;i<4;i++)bone(tailNames[i]!,new Vector3(0,H*(.85-.62*tailTimes[i]!),-L*.55-tailLength*.8*tailTimes[i]!),i?tailNames[i-1]:'pelvis');
  for(const [suffix,side] of [['l',1],['r',-1]] as const){
    const x=side*W*.42;
    bone('scapula_'+suffix,new Vector3(x*.78,H*1.03,L*.44),'chest');bone('front_upper_'+suffix,new Vector3(x,H*.9,L*.5),'scapula_'+suffix);bone('front_lower_'+suffix,new Vector3(x,H*.48,L*.445),'front_upper_'+suffix);bone('front_paw_'+suffix,new Vector3(x,pawY,L*.525),'front_lower_'+suffix);
    bone('hind_thigh_'+suffix,new Vector3(x,H*.92,-L*.51),'pelvis');bone('hind_shin_'+suffix,new Vector3(x,H*.56,-L*.405),'hind_thigh_'+suffix);bone('hind_hock_'+suffix,new Vector3(x,H*.24,-L*.575),'hind_shin_'+suffix);bone('hind_paw_'+suffix,new Vector3(x,pawY,-L*.465),'hind_hock_'+suffix);
  }
  const index=(name:string)=>bones.indexOf(byName.get(name)!),P=(name:string)=>points.get(name)!.clone();
  type RGB=[number,number,number];const rgb=(v:unknown):RGB=>{const c=new Color(String(v));return [c.r,c.g,c.b];};
  const fur=rgb(p['color.fur']),cream=rgb(p['color.cream']),dark=rgb(p['color.dark']),mixc=(a:RGB,b:RGB,t:number):RGB=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];
  const sockY=H*.34,tailStart=P('tail_base'),tailEnd=P('tail_tip'),tailSpan=tailStart.distanceTo(tailEnd);
  const coat=(pt:Vector3,n:Vector3):RGB=>{if(pt.y<sockY&&(Math.abs(pt.z-L*.5)<L*.12||Math.abs(pt.z+L*.5)<L*.16))return dark;if(n.y<-.45&&pt.y<H*.95)return cream;if(pt.z>L*.38&&pt.y<H*1.02&&pt.y>H*.6&&n.z>.2)return cream;return fur;};
  const sculpt=new SculptBody({bone:index('spine'),paint:coat,detail:1,blend:.045*L});const torso=sculpt.root;
  torso.ellipsoid('haunch',new Vector3(0,H*.82,-L*.44),[H*.2,H*.2,L*.26],{bone:index('pelvis')});
  torso.ellipsoid('belly',new Vector3(0,H*.84,-L*.05),[H*.19,H*.2,L*.42],{bone:index('spine')});
  torso.ellipsoid('chest',new Vector3(0,H*.88,L*.4),[H*.21,H*.25,L*.24],{bone:index('chest'),forward:new Vector3(0,-.3,1)});
  torso.ellipsoid('neck',new Vector3(0,H*1.04,L*.56),[H*.15,H*.22,L*.16],{bone:index('neck'),forward:new Vector3(0,.7,.7)});
  const hc=new Vector3(0,headY,headBack+skullLength*.4),muzzleLen=headLength-skullLength;
  const headPaint=(pt:Vector3,n:Vector3):RGB=>{const l=pt.clone().sub(hc);if(l.z>skullLength*.45&&l.y<-headLength*.03)return cream;if(l.y<-headLength*.08&&n.y<0)return cream;return fur;};
  const skull=torso.attach('head',{bone:index('head'),paint:headPaint,join:.025*L,blend:.02*L});
  skull.ellipsoid('cranium',hc,[headLength*.4,headLength*.35,skullLength*.75]);
  for(const side of [1,-1])skull.ellipsoid('cheek',hc.clone().add(new Vector3(side*headLength*.16,-headLength*.08,skullLength*.05)),[headLength*.17,headLength*.15,skullLength*.4]);
  const muzzleBase=hc.clone().add(new Vector3(0,-headLength*.07,skullLength*.45)),muzzleTip=muzzleBase.clone().add(new Vector3(0,-headLength*.05,muzzleLen*1.05));
  skull.limb('muzzle',[muzzleBase,muzzleTip],[headLength*.15,headLength*.055]);
  const noseAt=skull.surface(muzzleTip.clone().add(new Vector3(0,0,-muzzleLen*.2)),new Vector3(0,.15,1));
  skull.attach('nose',{paint:dark,detail:3,join:.004*L,blend:.004*L}).ellipsoid('pad',noseAt,[headLength*.045,headLength*.035,headLength*.035]);
  for(const side of [1,-1] as const){
    const suffix=side>0?'l':'r',dir=new Vector3(side*.75,.25,.6).normalize(),seat=skull.surface(hc.clone().add(new Vector3(side*headLength*.08,headLength*.04,skullLength*.25)),dir);
    skull.decal('eye_'+suffix,seat,dir,[{radius:headLength*.07,paint:mixc(fur,dark,.6)},{radius:headLength*.045,paint:dark}],{up:new Vector3(0,1,0),stretch:1.3,segments:10,detail:4});
    const base=P('ear_'+suffix),earH=headLength*Number(p.earRatio),earDir=new Vector3(side*.28,1,.08).normalize(),facing=new Vector3(0,0,1).addScaledVector(earDir,-earDir.z).normalize();
    const earPaint=(pt:Vector3):RGB=>pt.distanceTo(base)>earH*.72?dark:fur;
    const ear=skull.attach('ear_'+suffix,{bone:index('ear_'+suffix),paint:earPaint,detail:3,join:.012*L,blend:.008*L});
    ear.ellipsoid('leaf',base.clone().addScaledVector(earDir,earH*.42),[headLength*.17,headLength*.045,earH*.6],{forward:earDir,up:facing,taper:-.75});
    ear.paint('inner',base.clone().addScaledVector(earDir,earH*.4).addScaledVector(facing,headLength*.035),[headLength*.08,headLength*.03,earH*.32],{forward:earDir,up:facing,taper:-.7,paint:cream,detail:3});
  }
  const tailPaint=(pt:Vector3):RGB=>pt.distanceTo(tailStart)>tailSpan*.8?cream:fur;
  const tail=torso.attach('tail',{bone:index('tail_base'),paint:tailPaint,join:.02*L,blend:.03*L});
  const tailNamesAll=['tail_base','tail_mid_a','tail_mid_b','tail_tip'],tailR=[.35,.85,1,.75];
  for(let i=0;i<3;i++){const a=P(tailNamesAll[i]!),b=P(tailNamesAll[i+1]!);tail.limb('seg'+i,[a,b],[tailRadius*.62*tailR[i]!,tailRadius*.62*tailR[i+1]!],{bone:index(tailNamesAll[i+1]!)});}
  tail.ellipsoid('tip',tailEnd.clone().addScaledVector(tailEnd.clone().sub(P('tail_mid_b')).normalize(),tailRadius*.4),[tailRadius*.4,tailRadius*.4,tailRadius*.6],{bone:index('tail_tip'),forward:tailEnd.clone().sub(P('tail_mid_b'))});
  for(const suffix of ['l','r']){
    const fu=P('front_upper_'+suffix),fl=P('front_lower_'+suffix),fp=P('front_paw_'+suffix),ft=fp.clone();ft.y=L*.02;
    const front=torso.attach('front_'+suffix,{bone:index('front_upper_'+suffix),join:.03*L,blend:.012*L});
    front.limb('arm',[fu.clone().add(new Vector3(0,H*.05,0)),fl,ft],[H*.09,H*.065,H*.055],{bones:[index('front_upper_'+suffix),index('front_lower_'+suffix)]});
    front.ellipsoid('paw',new Vector3(fp.x,L*.022,fp.z+L*.02),[H*.07,L*.024,L*.06],{bone:index('front_paw_'+suffix)});
    const ht=P('hind_thigh_'+suffix),hs=P('hind_shin_'+suffix),hh=P('hind_hock_'+suffix),hp=P('hind_paw_'+suffix),hpt=hp.clone();hpt.y=L*.02;
    const hind=torso.attach('hind_'+suffix,{bone:index('hind_thigh_'+suffix),join:.035*L,blend:.015*L});
    hind.ellipsoid('thigh',ht.clone().lerp(hs,.4),[H*.14,H*.22,L*.14],{bone:index('hind_thigh_'+suffix),forward:hs.clone().sub(ht)});hind.limb('upper',[ht,hs],[H*.13,H*.075],{bone:index('hind_thigh_'+suffix)});
    hind.limb('shin',[hs,hh],[H*.07,H*.055],{bone:index('hind_shin_'+suffix)});
    hind.limb('foot',[hh,hpt],[H*.055,H*.05],{bone:index('hind_hock_'+suffix)});
    hind.ellipsoid('paw',new Vector3(hp.x,L*.022,hp.z+L*.02),[H*.07,L*.024,L*.06],{bone:index('hind_paw_'+suffix)});
  }
  const result=sculpt.build({triangles:2200,cell:.0065*L/.44,floor:0,jitter:.03});
  const t=result.topology;if(t.shells!==1||t.boundaryEdges||t.windingErrors)throw new Error('Fox coat is not one closed surface ('+JSON.stringify(t)+')');
  if(result.separation(index('front_lower_l'),index('front_lower_r'))<.01*L)throw new Error('Fox front legs intersect');
  if(result.separation(index('hind_shin_l'),index('hind_shin_r'))<.01*L)throw new Error('Fox hind legs intersect');
  root.updateMatrixWorld(true);const skeleton=new Skeleton(bones);skeleton.calculateInverses();
  const material=new MeshStandardMaterial({name:'fur',color:'#ffffff',roughness:.9,metalness:0,flatShading:true,vertexColors:true});
  const mesh=new SkinnedMesh(result.geometry(),material);mesh.name='fox-coat';mesh.userData.materialRole='fur';mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);mesh.bind(skeleton);const materials={fur:material};
  root.updateMatrixWorld(true);skeleton.update();const chains=[] as RigMetadata['chains'],effectors=[] as NonNullable<RigMetadata['effectors']>;
  for(const suffix of ['l','r'])for(const pair of ['front','hind']){const upper=(pair==='front'?'front_upper_':'hind_thigh_')+suffix,lower=(pair==='front'?'front_lower_':'hind_shin_')+suffix,end=(pair==='front'?'front_paw_':'hind_hock_')+suffix,paw=pair+'_paw_'+suffix;chains.push({upper,lower,end,side:suffix==='l'?'left':'right'});effectors.push({id:pair+'_'+suffix,bone:paw,chain:upper,offset:points.get(end)!.clone().sub(points.get(paw)!).toArray() as [number,number,number],groundOffset:pawY});}
  const bounds=new Box3().setFromObject(root),anchors={ground:[0,0,0],head:points.get('head')!.toArray()},rig:RigMetadata={version:1,kind:'fox',bones:bones.map(node=>({name:node.name,parent:node.parent instanceof Bone?node.parent.name:null})),meshes:['fox-coat'],chains,effectors,clips:[]};root.userData={configuration:config,units:'meters',up:'+Y',forward:'+Z',origin:'ground-center',anchors};return {root,config,materials,bounds,dimensions:bounds.getSize(new Vector3()),anchors,rig};
}
export const foxRecipe:Recipe={descriptor:{id:'stylized-fox',version:'1.1.0',title:'Stylized fox',description:'Original quadruped with tapered muzzle, upright ears and a weighted bushy tail.',controls,defaults:parseControls(controls,{}),presets:[{id:'default',name:'Russet fox',description:'Russet coat with cream underside, dark socks and ear tips.',parameters:{}},{id:'silver',name:'Silver fox',description:'Charcoal-grey coat with a white tail tip.',parameters:{'color.fur':'#5d5a5c','color.cream':'#e9e7e3','color.dark':'#1f1d1e'}},{id:'arctic',name:'Arctic fox',description:'White winter coat with small ears and a full tail.',parameters:{'color.fur':'#ecebe6','color.cream':'#ffffff','color.dark':'#a49d96',earRatio:.38,muzzleRatio:.38,tailFullness:.18}}],palettes:[],save,state:input=>parameterState(controls,input)},build,load,validationCases:[{id:'default',name:'Default proportions',parameters:{}}],integrationCases:[],constraints:['Flatground paw contact only','No retargeting or facial animation'],presentation:{category:'animal',order:101,kitIds:[]},source:{entry:'examples/recipes/stylized-fox/index.ts',exportName:'foxRecipe'}};
