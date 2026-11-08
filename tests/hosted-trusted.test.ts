import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {verifyTrustedRecipe} from '../hosted/trusted-build.ts';

test('trusted built-in identity checks exact package and current implementation',async()=>{
 const index=JSON.parse(await readFile('public/recipe-packages/index.json','utf8')),entry=index.packages.find((entry:{id:string})=>entry.id==='bench'),bytes=await readFile('public/'+entry.url);
 const record=await verifyTrustedRecipe(entry,bytes,path=>readFile(path));assert.equal(record.id,'bench');assert.equal(record.version,'1.1.0');assert.equal(record.archive.sha256,entry.sha256);assert.equal(record.archive.path,'packages/bench-1.1.0-source.4.zip');assert.match(record.sourceHash,/^[a-f0-9]{64}$/);
 await assert.rejects(()=>verifyTrustedRecipe({...entry,sha256:'0'.repeat(64)},bytes,path=>readFile(path)),/archive identity/);
 await assert.rejects(()=>verifyTrustedRecipe(entry,bytes,async path=>path==='examples/recipes/bench/index.ts'?new TextEncoder().encode('different implementation'):readFile(path)),/implementation identity/);
 await assert.rejects(()=>verifyTrustedRecipe({...entry,version:'9.9.9'},bytes,path=>readFile(path)),/recipe identity/);
});
