import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { posix, join } from 'node:path';
import { parseSync } from 'rolldown/utils';
import { buildEntry, runnerEntry } from './recipe-package-templates.ts';
import { riggedBuildEntry,riggedRunnerEntry } from './recipe-package-rigged-templates.ts';
import { legacyBuildEntry, legacyRunnerEntry } from './recipe-package-legacy.ts';
import { currentDeliveryRevision,sourceDeliveryFor } from './recipe-package-identity.ts';

export type PackageFiles = Record<string,string>;
export interface LicenseDeclaration { author:string; statement:string; softwareLicense:'Apache-2.0'; contentLicense:'CC0-1.0'|'Apache-2.0'; contentDesignation:string }
export const pinnedDependencies={three:'0.186.1',typescript:'7.0.2'};
function canonical(value:unknown):string{
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>JSON.stringify(key)+':'+canonical(item)).join(',')+'}';
  return JSON.stringify(value);
}
export function dependencyLock(name:string){
  const original=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url),'utf8'));
  const packages:Record<string,any>={'':{name,version:'1.0.0',dependencies:pinnedDependencies}};
  function include(id:string,version:string){
    const path='node_modules/'+id;
    if(packages[path])return;
    const item=structuredClone(original.packages[path]);
    if(!item||item.version!==version||item.link||item.hasInstallScript||item.scripts||typeof item.integrity!=='string'||!/^sha512-[a-zA-Z0-9+/]+=*$/.test(item.integrity))throw new Error('Unapproved locked dependency: '+id);
    const expected='https://registry.npmjs.org/'+id+'/-/'+id.split('/').at(-1)+'-'+version+'.tgz';
    if(item.resolved!==expected||!['three','typescript'].includes(id)&&!/^@typescript\/typescript-[a-z0-9-]+$/.test(id))throw new Error('Unsupported dependency source: '+id);
    delete item.dev;
    packages[path]=item;
    for(const [child,revision] of Object.entries({...item.dependencies,...item.optionalDependencies})){
      if(typeof revision!=='string'||!/^\d+\.\d+\.\d+$/.test(revision))throw new Error('Unpinned transitive dependency: '+child);
      include(child,revision);
    }
    if(item.peerDependencies&&Object.keys(item.peerDependencies).length)throw new Error('Unsupported peer dependencies: '+id);
  }
  for(const [id,version] of Object.entries(pinnedDependencies))include(id,version);
  return {name,version:'1.0.0',lockfileVersion:3,requires:true,packages};
}
export interface PackageInput { id:string; version:string; entry:string; exportName:string; dependencies:Record<string,string>; nodeVersion:string; licensing:LicenseDeclaration; deliveryRevision?:2|3|4 }
export interface PackageManifest {
  formatVersion:1|2;
  deliveryRevision?:number;
  recipe:{id:string;version:string;entry:string;exportName:string};
  configuration:{path:string;kind:'default'};
  controls:string;
  dependencies:Record<string,string>;
  toolchain:{node:string;build:string};
  licenses:{software:string;content:string;contentPaths:string[];thirdParty:string};
  provenance:{kind:string;sourceHash:string;author:string;statement:string;reviewStatus:string;contentDesignation:string};
  files:Record<string,{sha256:string;bytes:number}>;
}
export const sha256=(value:string|Uint8Array)=>createHash('sha256').update(value).digest('hex');
const sourcePattern=/^(src\/(catalog|recipes|engine|lantern|families|rigging)\/|examples\/recipes\/)[a-zA-Z0-9/_-]+\.ts$/;
const special=new Set(['manifest.json','config.json','controls.json','package.json','package-lock.json','build.mjs','runner.ts','REBUILD.md','LICENSE','NOTICE','scripts/node-platform.ts','dependency-licenses.json']);
const licenses=/^LICENSES\/[a-zA-Z0-9._-]+\.txt$/;
export function safePackagePath(path:string):string {
  if(typeof path!=='string'||path.length>240||path.includes('\\')||path.split('/').some(p=>!p||p==='.'||p==='..')||/secret|credential|token|private|\.env/i.test(path)||!(special.has(path)||sourcePattern.test(path)||licenses.test(path)))throw new Error('Forbidden package path: '+path);
  return path;
}
function importsOf(path:string,text:string):string[]{
  const parsed=parseSync(path,text),imports:string[]=[];
  if(parsed.errors.length)throw new Error('Invalid source syntax: '+path);
  function visit(node:any){
    if(!node||typeof node!=='object')return;
    if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type)&&node.source){if(typeof node.source.value!=='string')throw new Error('Unknown source import: '+path);imports.push(node.source.value);}
    if(node.type==='ImportExpression'||node.type==='TSImportEqualsDeclaration'||node.type==='CallExpression'&&node.callee?.type==='Identifier'&&['require','eval'].includes(node.callee.name))throw new Error('Dynamic or unsupported import: '+path);
    if(node.type==='TSImportType'){if(typeof node.argument?.value!=='string')throw new Error('Unsupported type import: '+path);imports.push(node.argument.value);}
    for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
  }
  visit(parsed.program);
  if(/-----BEGIN .*PRIVATE KEY-----|(?:api[_-]?key|access[_-]?token)\s*[:=]\s*["'][^"']+/i.test(text))throw new Error('Potential credential in source: '+path);
  return imports;
}
const external=new Set(['three','three/addons/exporters/GLTFExporter.js','three/addons/geometries/ConvexGeometry.js','three/addons/utils/BufferGeometryUtils.js']);
export function sourceImports(path:string,text:string,deliveryRevision=3):string[]{
  return importsOf(path,text).flatMap(specifier=>{
    if(specifier.startsWith('./')||specifier.startsWith('../')){
      if(specifier.includes('\\')||specifier.includes('?')||specifier.includes('#'))throw new Error('Unsupported import path: '+specifier);
      return [safePackagePath(posix.normalize(posix.join(posix.dirname(path),specifier)))];
    }
    if(external.has(specifier)||deliveryRevision>=3&&specifier==='three/addons/utils/SkeletonUtils.js'||path==='runner.ts'&&['node:fs/promises','node:crypto','node:path'].includes(specifier))return [];
    throw new Error('Unapproved import '+specifier+' in '+path);
  });
}
export async function collectSources(root:string,entries:string[]):Promise<PackageFiles>{
  const result:PackageFiles={};
  if((await lstat(root)).isSymbolicLink())throw new Error('Symlink source root');
  async function include(path:string){
    safePackagePath(path);
    if(Object.hasOwn(result,path))return;
    let current=root;
    for(const part of path.split('/')){
      current=join(current,part);
      if((await lstat(current)).isSymbolicLink())throw new Error('Symlink source: '+path);
    }
    const stat=await lstat(current);
    if(!stat.isFile()||stat.size>4*1024*1024)throw new Error('Not a bounded source file: '+path);
    const text=await readFile(current,'utf8');
    result[path]=text;
    for(const dependency of sourceImports(path,text))await include(dependency);
  }
  for(const path of entries)await include(path);
  return result;
}
export function sealPackage(files:PackageFiles,input:PackageInput):PackageFiles{
  validateDeclaration(input.licensing);
  const hashes=Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)).map(([path,text])=>[safePackagePath(path),{sha256:sha256(text),bytes:Buffer.byteLength(text)}]));
  const manifest:PackageManifest={
    formatVersion:2,deliveryRevision:input.deliveryRevision??currentDeliveryRevision,recipe:{id:input.id,version:input.version,entry:input.entry,exportName:input.exportName},
    configuration:{path:'config.json',kind:'default'},controls:'controls.json',dependencies:input.dependencies,
    toolchain:{node:input.nodeVersion,build:'npm run rebuild -- --config config.json --out output.glb'},
    licenses:{software:input.licensing.softwareLicense,content:input.licensing.contentLicense,contentPaths:['config.json'],thirdParty:'dependency-licenses.json'},
    provenance:{kind:'author-declaration',author:input.licensing.author,statement:input.licensing.statement,contentDesignation:input.licensing.contentDesignation,reviewStatus:'not-established-by-packaging',sourceHash:sha256(JSON.stringify(hashes))},files:hashes,
  };
  return {...files,'manifest.json':JSON.stringify(manifest,null,2)+'\n'};
}
function record(value:unknown):value is Record<string,unknown>{return !!value&&typeof value==='object'&&!Array.isArray(value);}
export function validateDeclaration(value:unknown):asserts value is LicenseDeclaration{
  if(!record(value)||value.softwareLicense!=='Apache-2.0'||!['CC0-1.0','Apache-2.0'].includes(String(value.contentLicense))||['author','statement','contentDesignation'].some(key=>typeof value[key]!=='string'||!(value[key] as string).trim()))throw new Error('Missing or unsupported license/provenance declaration');
}
export function declarationFor(metadata:unknown,id:string):LicenseDeclaration{
  if(!record(metadata)||metadata.formatVersion!==1||!record(metadata.recipes))throw new Error('Invalid declaration metadata');
  const value=metadata.recipes[id];
  validateDeclaration(value);
  return value;
}
export function validatePackageFiles(files:PackageFiles):PackageManifest{
  if(Object.keys(files).length>512||Object.values(files).reduce((sum,text)=>sum+Buffer.byteLength(text),0)>32*1024*1024)throw new Error('Oversized package');
  for(const [path,text] of Object.entries(files)){safePackagePath(path);if(typeof text!=='string')throw new Error('Invalid member: '+path);}
  const m=JSON.parse(files['manifest.json']??'null') as PackageManifest;
  if(!record(m)||!sourceDeliveryFor(m.formatVersion,m.deliveryRevision)||!record(m.recipe)||!record(m.files)||!record(m.dependencies)||!record(m.provenance)||!record(m.licenses)||!record(m.toolchain)||!record(m.configuration))throw new Error('Invalid manifest');
  if(!/^[a-z][a-z0-9-]*$/.test(m.recipe.id)||!/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(m.recipe.version)||!/^[a-zA-Z_$][\w$]*$/.test(m.recipe.exportName))throw new Error('Invalid recipe metadata');
  validateDeclaration({author:m.provenance.author,statement:m.provenance.statement,contentDesignation:m.provenance.contentDesignation,softwareLicense:m.licenses.software,contentLicense:m.licenses.content});
  if(m.provenance.kind!=='author-declaration'||m.provenance.reviewStatus!=='not-established-by-packaging')throw new Error('Packaging must not assert review approval');
  safePackagePath(m.recipe.entry);
  if(!Object.hasOwn(files,m.recipe.entry)||m.configuration.path!=='config.json'||m.configuration.kind!=='default'||m.controls!=='controls.json')throw new Error('Invalid recipe entry or configuration');
  const legacy=m.formatVersion===1;
  const rigged=(m.deliveryRevision??0)>=3;
  if(!rigged&&Object.keys(files).some(path=>path.startsWith('src/rigging/')))throw new Error('Revision 3 required for rigging sources');
  if(files['build.mjs']!==(legacy?legacyBuildEntry:rigged?riggedBuildEntry:buildEntry)||files['runner.ts']!==(legacy?legacyRunnerEntry(m.recipe.id):rigged?riggedRunnerEntry(m.recipe.id):runnerEntry(m.recipe.id)))throw new Error('Unsupported build/export entry');
  const required=['config.json','controls.json','build.mjs','runner.ts','package.json','package-lock.json','REBUILD.md','LICENSE','NOTICE','LICENSES/Apache-2.0.txt','LICENSES/CC0-1.0.txt','dependency-licenses.json'];
  for(const path of required)if(!Object.hasOwn(files,path))throw new Error('Missing required member: '+path);
  const declared=Object.keys(m.files).sort(),actual=Object.keys(files).filter(p=>p!=='manifest.json').sort();
  if(JSON.stringify(declared)!==JSON.stringify(actual))throw new Error('Package member list mismatch');
  for(const [path,hash] of Object.entries(m.files)){
    safePackagePath(path);
    if(!record(hash)||hash.sha256!==sha256(files[path]!)||hash.bytes!==Buffer.byteLength(files[path]!))throw new Error('Integrity mismatch: '+path);
    if(path.endsWith('.ts'))for(const dependency of sourceImports(path,files[path]!,m.deliveryRevision??1))if(!Object.hasOwn(files,dependency))throw new Error('Missing source dependency: '+dependency);
  }
  if(m.provenance.sourceHash!==sha256(JSON.stringify(m.files)))throw new Error('Source hash mismatch');
  const p=JSON.parse(files['package.json']!),lock=JSON.parse(files['package-lock.json']!);
  if(!record(p)||p.type!=='module'||!record(p.scripts)||JSON.stringify(p.scripts)!==JSON.stringify({rebuild:'node build.mjs'})||JSON.stringify(p.dependencies)!==JSON.stringify(m.dependencies)||lock.lockfileVersion!==3||JSON.stringify(lock.packages?.['']?.dependencies)!==JSON.stringify(m.dependencies))throw new Error('Invalid dependency/build metadata');
  if(typeof p.name!=='string'||canonical(m.dependencies)!==canonical(pinnedDependencies)||canonical(lock)!==canonical(dependencyLock(p.name)))throw new Error('Unapproved dependency graph, version, integrity or source');
  if(p.devDependencies||p.optionalDependencies||p.peerDependencies||p.overrides||p.workspaces||p.imports||p.exports)throw new Error('Unsupported package resolution metadata');
  if(Object.keys(p).some(key=>!['name','version','private','type','license','engines','scripts','dependencies'].includes(key)))throw new Error('Unsupported package metadata');
  for(const [name,version] of Object.entries(m.dependencies))if(!['three','typescript'].includes(name)||!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Unsupported or unpinned dependency');
  if(JSON.stringify(m.licenses.contentPaths)!==JSON.stringify(['config.json']))throw new Error('Invalid license scope');
  JSON.parse(files['config.json']!);
  if(!Array.isArray(JSON.parse(files['controls.json']!)))throw new Error('Invalid control schema');
  return m;
}
