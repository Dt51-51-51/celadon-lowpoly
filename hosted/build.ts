import {build} from 'vite';
import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import {resolve,join,dirname,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {canonical} from '../src/review/identity.ts';
import {trustedRecipes} from './trusted-build.ts';
const digest=(bytes:Uint8Array|string)=>createHash('sha256').update(bytes).digest('hex');
const type=(path:string)=>path.endsWith('.html')?'text/html; charset=utf-8':path.endsWith('.js')?'text/javascript; charset=utf-8':path.endsWith('.css')?'text/css; charset=utf-8':path.endsWith('.png')?'image/png':path.endsWith('.webp')?'image/webp':path.endsWith('.zip')?'application/zip':path.endsWith('.txt')?'text/plain; charset=utf-8':'application/octet-stream';
export function canonicalFiles(files:Record<string,unknown>){return canonical(files);}
async function inventory(root:string){
 const files:Record<string,{sha256:string;bytes:number;media_type:string}>={};
 async function walk(path:string){for(const entry of await readdir(path,{withFileTypes:true})){const file=join(path,entry.name);if(entry.isDirectory())await walk(file);else{const name=relative(root,file).replaceAll('\\','/'),bytes=await readFile(file);files[name]={sha256:digest(bytes),bytes:bytes.length,media_type:type(name)};}}}
 await walk(root);return Object.fromEntries(Object.keys(files).sort().map(path=>[path,files[path]!]));
}
/** One module for the app: identical notice texts across recipes are stored once and shared by reference. */
export function trustedRecipeModule(records:Array<{notices:Record<string,string>}>):string{
 const texts:string[]=[],slot=new Map<string,number>(),at=(text:string)=>{let i=slot.get(text);if(i===undefined){i=texts.length;texts.push(text);slot.set(text,i);}return i;};
 const rows=records.map(({notices,...record})=>'{...'+JSON.stringify(record)+',notices:{'+Object.entries(notices).map(([path,text])=>JSON.stringify(path)+':t['+at(text)+']').join(',')+'}}');
 return 'const t='+JSON.stringify(texts)+';\nexport default ['+rows.join(',\n')+'];\n';
}
export async function buildHosted(output:string,options:{packageDirectory?:string}={}){
 const root=resolve(output);await mkdir(dirname(root),{recursive:true});await mkdir(root,{recursive:false});const imports=new Set<string>();
 await build({configFile:resolve('vite.hosted.public.ts'),logLevel:'error',build:{outDir:join(root,'public')},plugins:[{name:'public-boundary',generateBundle(){for(const id of this.getModuleIds()){const path=relative(process.cwd(),id).replaceAll('\\','/');if(/^(src\/(catalog|recipes|families|lantern|studio)\/|src\/site\/previews\/|examples\/recipes\/)/.test(path))throw Error('Private module in public build: '+path);if(!path.startsWith('node_modules/')&&!path.startsWith('\0'))imports.add(path);}}}]});
 const approved=['brand/supplied-v1/clean/logo.png','brand/supplied-v1/clean/wordmark.png','brand/supplied-v1/clean/lockup.png','brand/courtyard.png','brand/hero-fruit-stall.webp','brand/rabbit-engine-compare.png','agent-bundles/polyspoon-agent-4.zip','llms.txt','prompt.txt'];
 for(const path of approved){const target=join(root,'public',path);await mkdir(dirname(target),{recursive:true});await copyFile(join('public',path),target);}
 const trusted=await trustedRecipes(process.cwd(),options.packageDirectory),virtual='virtual:hosted-trusted-recipes';
 await build({configFile:resolve('vite.hosted.app.ts'),logLevel:'error',build:{outDir:join(root,'app')},plugins:[{name:'trusted-built-in-recipes',resolveId(id){if(id===virtual)return '\0'+virtual;},load(id){if(id==='\0'+virtual)return trustedRecipeModule(trusted);}}]});
 await writeFile(join(root,'trusted-recipes.json'),JSON.stringify(trusted.map(({notices,...record})=>record),null,2)+'\n',{flag:'wx'});
 const files=await inventory(join(root,'app')),releaseHash=digest(canonicalFiles(files));
 await writeFile(join(root,'private-release.json'),JSON.stringify({formatVersion:1,releaseHash,files},null,2)+'\n',{flag:'wx'});
 await writeFile(join(root,'public-files.json'),JSON.stringify({formatVersion:1,files:await inventory(join(root,'public'))},null,2)+'\n',{flag:'wx'});
 await writeFile(join(root,'public-imports.json'),JSON.stringify([...imports].sort(),null,2)+'\n',{flag:'wx'});
 return {output:root,releaseHash,files};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){const args=process.argv.slice(2),values=new Map<string,string>();for(let index=0;index<args.length;index+=2){const key=args[index]!,value=args[index+1];if(!['--out','--package-dir'].includes(key)||!value||value.startsWith('--')||values.has(key))throw Error('Use --out FRESH_OUTPUT [--package-dir VERIFIED_PACKAGES]');values.set(key,value);}if(!values.has('--out'))throw Error('Use --out FRESH_OUTPUT [--package-dir VERIFIED_PACKAGES]');console.log(JSON.stringify(await buildHosted(values.get('--out')!,{packageDirectory:values.get('--package-dir')}),null,2));}
