import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { currentDeliveryRevision } from '../scripts/recipe-package-identity.ts';
import { buildSourcePackages } from '../scripts/recipe-package.ts';
import { buildProceduralModules } from '../scripts/recipe-module.ts';
import { trustedRecipes } from '../hosted/trusted-build.ts';
import { sha256 } from '../scripts/recipe-package-core.ts';

test('local default source and module builds retain activated identities and historical bytes',async()=>{
 assert.equal(currentDeliveryRevision,4);
 const receipt=JSON.parse(await readFile('evidence/rigged-catalog/activation/artifact-activation.json','utf8'));
 const sources=await readFile('public/recipe-packages/index.json'),modules=await readFile('public/procedural-modules/index.json');
 const index=await buildSourcePackages();assert.equal(index.packages.length,20);assert.ok(index.packages.every(entry=>entry.deliveryRevision===4));
 assert.deepEqual(await readFile('public/recipe-packages/index.json'),sources);
 const procedural=await buildProceduralModules(undefined,{retainPublished:true});assert.equal(procedural.packages.length,20);
 assert.deepEqual(await readFile('public/procedural-modules/index.json'),modules);
 assert.equal((await trustedRecipes()).length,20);
 for(const [path,record] of Object.entries(receipt.before.immutable) as Array<[string,{sha256:string}]>)assert.equal(sha256(await readFile(path)),record.sha256,path);
 assert.equal(sha256(await readFile('public/agent-bundles/polyspoon-agent-3.zip')),'e826f96918141bb085ec9ea1bf6660b802a900a0b894885d7aa6489a704416a5');
});
