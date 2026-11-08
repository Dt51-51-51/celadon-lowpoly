import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build as esbuild} from 'esbuild';
import {zipFiles} from '../src/catalog/export.ts';
import {readPackageZip} from './recipe-check.ts';
import {sha256} from './provenance.ts';
import {validatePackageFiles} from './recipe-package-core.ts';
import {currentDeliveryRevision,sourcePackageFilename} from './recipe-package-identity.ts';

/** Self-contained OBJ/FBX/USDZ converter and controls writer for the local toolkit. */
export async function formatsModule(){const result=await esbuild({entryPoints:['src/formats/agent.ts'],bundle:true,format:'esm',platform:'neutral',target:'es2022',write:false,legalComments:'none',banner:{js:'// Polyspoon formats module, generated from src/formats by scripts/agent-bundle.ts. Apache-2.0.'}});return result.outputFiles[0]!.contents;}
export async function buildAgentBundle({directory,archive,packageDirectory=resolve('public/recipe-packages'),deliveryRevision=currentDeliveryRevision}:{directory:string;archive:string;packageDirectory?:string;deliveryRevision?:2|3|4}){
 if(![2,3,4].includes(deliveryRevision))throw Error('Unsupported source delivery revision');
 if(deliveryRevision>=3&&resolve(archive).startsWith(resolve('public')+'/'))throw Error('Agent 3 requires an explicit candidate output');
 const source='integrations/agents/polyspoon',files:Record<string,Uint8Array>={};
 for(const name of (await readdir(source)).sort())if(!name.endsWith('.d.mts'))files[name]=await readFile(join(source,name));
 files['formats.mjs']=await formatsModule();files['model-controls.json']=await readFile('src/formats/model-controls.json');
 files.LICENSE=await readFile('LICENSE');files.NOTICE=await readFile('NOTICE');
 const index=JSON.parse(await readFile(join(packageDirectory,'index.json'),'utf8'));
 if(index.formatVersion!==2||!Array.isArray(index.packages))throw Error('Invalid source package index');
 const entries=index.packages.filter((p:{id:string;deliveryRevision:number})=>p.id==='bench'&&p.deliveryRevision===deliveryRevision);
 if(entries.length!==1)throw Error('Verified revision '+deliveryRevision+' bench source package is required');
 const entry=entries[0],filename=sourcePackageFilename('bench',entry.version,deliveryRevision);
 if(entry.url!=='recipe-packages/'+filename)throw Error('Source archive index path mismatch');
 const bytes=await readFile(join(packageDirectory,filename));if(sha256(bytes)!==entry.sha256||bytes.length!==entry.bytes)throw Error('Source archive index mismatch');
 const packageManifest=validatePackageFiles(readPackageZip(bytes));
 if(packageManifest.recipe.id!=='bench'||packageManifest.recipe.version!==entry.version||packageManifest.deliveryRevision!==deliveryRevision)throw Error('Toolkit source identity mismatch');
 files['toolkit.zip']=bytes;
 const manifest={formatVersion:1,name:'polyspoon-agent',version:deliveryRevision===4?'1.3.0':deliveryRevision===3?'1.2.0':'1.0.1',toolkit:{recipe:'bench',recipeVersion:entry.version,deliveryRevision,sha256:entry.sha256,sourceHash:packageManifest.provenance.sourceHash},files:Object.fromEntries(Object.entries(files).map(([name,data])=>[name,{sha256:sha256(data),bytes:data.length}]))};
 files['bundle.json']=new TextEncoder().encode(JSON.stringify(manifest,null,2)+'\n');
 await mkdir(dirname(resolve(directory)),{recursive:true});await mkdir(directory,{recursive:false});for(const [name,data] of Object.entries(files))await writeFile(join(directory,name),data,{flag:'wx'});
 await mkdir(dirname(resolve(archive)),{recursive:true});await writeFile(archive,zipFiles(files),{flag:'wx'});return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const args=process.argv.slice(2),options=new Map<string,string>();
 for(let i=0;i<args.length;i+=2){const key=args[i]!,value=args[i+1];if(!['--directory','--archive','--package-directory','--delivery-revision'].includes(key)||!value||value.startsWith('--')||options.has(key))throw Error('Use --directory NEW_DIRECTORY --archive NEW_ZIP [--package-directory SOURCE_DIRECTORY --delivery-revision 2|3|4]');options.set(key,value);}
 const directory=options.get('--directory'),archive=options.get('--archive'),revision=options.get('--delivery-revision');
 if(!directory||!archive||revision!==undefined&&!['2','3','4'].includes(revision))throw Error('Invalid bundle output or source delivery revision');
 console.log(JSON.stringify(await buildAgentBundle({directory,archive,packageDirectory:options.get('--package-directory'),deliveryRevision:revision===undefined?undefined:Number(revision) as 2|3|4}),null,2));
}
