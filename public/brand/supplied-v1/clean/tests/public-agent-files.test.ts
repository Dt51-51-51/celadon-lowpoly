import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {publicResponse} from '../server/public.ts';
import {comparison,faq,howItWorks} from '../hosted/public/content.ts';
import {controlsManifestText,controlsManifestPath} from '../scripts/model-controls.ts';
import {controlsDocument} from '../src/formats/controls.ts';

test('llms.txt and prompt.txt describe the toolkit and every export format without exposing models',async()=>{
 for(const name of ['llms.txt','prompt.txt']){const text=await readFile('public/'+name,'utf8');for(const word of ['celadon-agent-3.zip','--formats all','meters'])assert.ok(text.includes(word),name+' '+word);assert.doesNotMatch(text,/\/api\/catalog/);}
 const llms=await readFile('public/llms.txt','utf8');assert.match(llms,/^# Celadon Lowpoly\n\n> /);for(const f of ['asset.obj.zip','asset.fbx','asset.usdz','asset.controls.json'])assert.ok(llms.includes(f),f);
 const build=await readFile('hosted/build.ts','utf8');assert.ok(build.includes("'llms.txt','prompt.txt'"));
});

test('llms.txt and prompt.txt are served publicly only when listed in the frozen public files',async()=>{
 const seen:string[]=[];const env={PUBLIC_FILES:JSON.stringify(['/index.html','/llms.txt','/prompt.txt']),PUBLIC_ASSETS:{fetch:async(request:Request)=>{seen.push(new URL(request.url).pathname);return new Response('ok',{headers:{'content-type':'text/plain'}});}}} as never;
 for(const path of ['/llms.txt','/prompt.txt']){const response=await publicResponse(new Request('https://polyspoon.test'+path),env);assert.equal(response?.status,200);}
 assert.deepEqual(seen,['/llms.txt','/prompt.txt']);
 assert.equal(await publicResponse(new Request('https://polyspoon.test/other.txt'),env),null);
});

test('home comparison no longer lists export formats or model files as a gap',()=>{
 const formats=comparison.find(row=>/format/i.test(row[0]))!;assert.ok(formats);for(const f of ['GLB','OBJ','FBX','USDZ'])assert.ok(formats[1].includes(f),f);
 const files=comparison.find(row=>/machine-readable/i.test(row[0]))!;assert.ok(files&&/controls JSON/i.test(files[1])&&/llms\.txt/.test(files[1]));
 assert.ok(howItWorks.some(step=>/FBX/.test(step.body)&&/USDZ/.test(step.body)));assert.ok(faq.some(item=>/USDZ/.test(item.answer)));
});

test('controls manifest is current and per-model controls carry ranges, defaults, units and applied values',async()=>{
 assert.equal(await readFile(controlsManifestPath,'utf8'),controlsManifestText(),'run npm run controls:manifest');
 const doc=controlsDocument({design:{family:'bench',familyVersion:'1.1.0',applied:{width:2.2}}});
 const width=doc.parameters.find(p=>p.key==='width')! as {min:number;max:number;default:number;unit:string;value:unknown};
 assert.equal(width.unit,'m');assert.ok(width.min<width.default&&width.default<width.max);assert.equal(width.value,2.2);
 assert.deepEqual(doc.formats,['glb','obj','fbx','usdz']);assert.equal(doc.units.up,'+Y');
 assert.equal(controlsDocument({design:{family:'not-built-in',applied:{a:1}}}).parameters.length,0);
});
