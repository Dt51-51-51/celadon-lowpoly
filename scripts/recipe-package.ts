import { currentDeliveryRevision,sourcePackageFilename } from './recipe-package-identity.ts';
import { buildProceduralModules } from './recipe-module.ts';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile, lstat, open, rename, unlink } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { zipFiles } from '../src/catalog/export.ts';
import { collectSources, dependencyLock, pinnedDependencies, sealPackage, sha256, validatePackageFiles, validateDeclaration, declarationFor } from './recipe-package-core.ts';
import { buildEntry, rebuildInstructions, runnerEntry } from './recipe-package-templates.ts';
import { riggedBuildEntry,riggedRunnerEntry,riggedRebuildInstructions } from './recipe-package-rigged-templates.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
async function dependencyNotices(){
  const inventory:Record<string,unknown>={},files:Record<string,string>={};
  for(const name of ['three','typescript','@typescript/typescript-'+process.platform+'-'+process.arch]){
    const directory=join(root,'node_modules',name),pkg=JSON.parse(await readFile(join(directory,'package.json'),'utf8'));
    if(pkg.version!==(name==='three'?pinnedDependencies.three:pinnedDependencies.typescript))throw new Error('Installed dependency version mismatch: '+name);
    const license=await readFile(join(directory,'LICENSE'),'utf8');
    const key=name.replace(/[@/]/g,'-');
    files['LICENSES/'+key+'.txt']=license;
    inventory[name]={version:pkg.version,license:pkg.license,notice:'LICENSES/'+key+'.txt',evidence:'installed package metadata and license'};
    if(name==='typescript'){
      files['LICENSES/typescript-NOTICE.txt']=await readFile(join(directory,'NOTICE.txt'),'utf8');
    }
  }
  const lock=dependencyLock('inventory');
  const verified=JSON.parse(await readFile(join(root,'docs/licensing-dependencies.json'),'utf8'));
  const platformPackages=Object.entries(lock.packages).filter(([path])=>path.startsWith('node_modules/@typescript/')).map(([path,item])=>{
    const name=path.slice(13),record=verified.packages[name];
    if(!record||record.version!==item.version||record.integrity!==item.integrity||record.license!=='Apache-2.0')throw new Error('Missing verified platform dependency license: '+name);
    return {name,version:item.version,integrity:item.integrity,license:record.license,registryMetadata:record.registryMetadata,licenseEvidence:path.endsWith(process.platform+'-'+process.arch)?'installed package license and registry metadata checked':'exact-version registry metadata checked; platform binary not installed on this host'};
  });
  return {files,inventory:{installed:inventory,platformPackages,bundledDependencyCode:false}};
}
export async function buildSourcePackages(output=join(root,'public/recipe-packages'),families?:readonly string[],deliveryRevision:2|3|4=currentDeliveryRevision){
  const target=resolve(output);
  if(families&&target===resolve(root,'public/recipe-packages'))throw new Error('Family selection requires an explicit candidate output');
  if(![2,3,4].includes(deliveryRevision))throw new Error('Unsupported source delivery revision');
  const sources=await collectSources(root,['src/catalog/index.ts',deliveryRevision>=3?'src/catalog/delivery.ts':'src/catalog/export.ts','src/lantern/inspect.ts','scripts/node-platform.ts']);
  if(deliveryRevision===2&&Object.keys(sources).some(path=>path.startsWith('src/rigging/')))throw new Error('Revision 3 required for current catalog source; generate explicit candidates');
  const declarations=JSON.parse(await readFile(join(root,'docs/contributing/source-packages.json'),'utf8'));
  if(declarations.formatVersion!==1||!declarations.recipes||typeof declarations.recipes!=='object')throw new Error('Invalid declaration metadata');
  for(const declaration of Object.values(declarations.recipes))validateDeclaration(declaration);
  const {catalog,descriptor}=await import('../src/catalog/index.ts');
  const {recipe}=await import('../src/recipes/index.ts');
  const notices=await dependencyNotices();
  const licenses:Record<string,string>={};
  for(const file of ['LICENSE','NOTICE','LICENSES/Apache-2.0.txt','LICENSES/CC0-1.0.txt'])licenses[file]=await readFile(join(root,file),'utf8');
  const results=[];
  const prepared=[];
  if(families&&(new Set(families).size!==families.length||families.length===0||families.some(id=>!catalog.some(d=>d.id===id))))throw new Error('Invalid source package family selection');
  for(const descriptorItem of catalog.filter(d=>!families||families.includes(d.id))){
    const id=descriptorItem.id,d=descriptor(id),r=recipe(id),name='recipe-'+id;
    const licensing=declarationFor(declarations,id);
    const entrySources=await collectSources(root,[r.source.entry]);
    const files={
      ...sources,...entrySources,...licenses,...notices.files,
      'config.json':JSON.stringify(d.save({}),null,2)+'\n',
      'controls.json':JSON.stringify(d.controls,null,2)+'\n',
      'build.mjs':deliveryRevision>=3?riggedBuildEntry:buildEntry,'runner.ts':deliveryRevision>=3?riggedRunnerEntry(id):runnerEntry(id),'REBUILD.md':(deliveryRevision>=3?riggedRebuildInstructions:rebuildInstructions).replace('is designated original starter content under CC0-1.0','has the author-declared content license '+licensing.contentLicense),
      'dependency-licenses.json':JSON.stringify(notices.inventory,null,2)+'\n',
      'package.json':JSON.stringify({name,version:'1.0.0',private:true,type:'module',license:'Apache-2.0',engines:{node:'>=22.22.1'},scripts:{rebuild:'node build.mjs'},dependencies:pinnedDependencies},null,2)+'\n',
      'package-lock.json':JSON.stringify(dependencyLock(name),null,2)+'\n',
    };
    const sealed=sealPackage(files,{id,version:d.version,entry:r.source.entry,exportName:r.source.exportName,dependencies:pinnedDependencies,nodeVersion:process.versions.node,licensing,deliveryRevision});
    const manifest=validatePackageFiles(sealed);
    const bytes=zipFiles(Object.fromEntries(Object.entries(sealed).map(([path,text])=>[path,new TextEncoder().encode(text)])));
    const filename=sourcePackageFilename(id,d.version,deliveryRevision);
    prepared.push({filename,bytes});
    results.push({id,version:d.version,deliveryRevision,url:'recipe-packages/'+filename,sha256:sha256(bytes),bytes:bytes.length,configuration:manifest.configuration,licenses:manifest.licenses});
  }
  let current=dirname(target);
  while(current!==dirname(current)){try{if((await lstat(current)).isSymbolicLink())throw new Error('Symlink output directory');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}current=dirname(current);}
  await mkdir(target,{recursive:true});
  if((await lstat(target)).isSymbolicLink())throw new Error('Symlink output directory');
  const missing=[];
  for(const {filename,bytes} of prepared){
    const path=join(target,filename);
    try{
      const stat=await lstat(path);
      if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Invalid source output file');
      if(sha256(await readFile(path))!==sha256(bytes))throw new Error('Immutable source artifact conflict: '+filename);
    }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;missing.push({path,bytes});}
  }
  const index={formatVersion:2,packages:results};
  const indexPath=join(target,'index.json');
  try{const stat=await lstat(indexPath);if(!stat.isFile()||stat.isSymbolicLink())throw new Error('Invalid source output index');}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  for(const {path,bytes} of missing)await writeFile(path,bytes,{flag:'wx'});
  const temporaryIndex=join(target,'.index-'+randomUUID()+'.tmp');
  const handle=await open(temporaryIndex,'wx');
  try{
    await handle.writeFile(JSON.stringify(index,null,2)+'\n');
    await handle.close();
    await rename(temporaryIndex,indexPath);
  }finally{
    await handle.close();
    try{await unlink(temporaryIndex);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
  }
  return index;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const args=process.argv.slice(2);
  if(args.length&&!(args.length===2&&args[0]==='--out'))throw new Error('Use --out directory');
  buildSourcePackages(args[1]).then(async result=>{await buildProceduralModules(args[1]?join(resolve(args[1]),'procedural-modules'):undefined,{retainPublished:true});return result;}).then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(error);process.exitCode=1;});
}
