import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,mkdir } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { buildSourcePackages } from '../scripts/recipe-package.ts';
import { currentDeliveryRevision,sourcePackageFilename } from '../scripts/recipe-package-identity.ts';
import { readPackageZip } from '../scripts/recipe-check.ts';
import { validatePackageFiles,sha256 } from '../scripts/recipe-package-core.ts';
import { verifyTrustedRecipe,trustedRecipes } from '../hosted/trusted-build.ts';

test('rig delivery candidates preserve historical identities and exact trusted source',async()=>{
 assert.equal(currentDeliveryRevision,4);
 for(const filename of ['bench-1.1.0.zip','bench-1.1.0-source.2.zip'])validatePackageFiles(readPackageZip(await readFile('public/recipe-packages/'+filename)));
 assert.equal(sourcePackageFilename('stylized-fox','1.1.0',3),'stylized-fox-1.1.0-source.3.zip');
 assert.equal(sourcePackageFilename('stylized-fox','1.1.0',4),'stylized-fox-1.1.0-source.4.zip');
 await assert.rejects(buildSourcePackages(undefined,['bench']),/candidate output/);
 const base=resolve('evidence/rigged-catalog');await mkdir(base,{recursive:true});const output=await mkdtemp(join(base,'source4-'));
 const index=await buildSourcePackages(output);assert.equal(index.packages.length,20);
 const hashes:Record<string,string>={};
 for(const entry of index.packages){
  assert.equal(entry.deliveryRevision,4);const bytes=await readFile(join(output,entry.url.split('/').at(-1)!));hashes[entry.id]=sha256(bytes);
  const files=readPackageZip(bytes),manifest=validatePackageFiles(files);assert.equal(manifest.deliveryRevision,4);
  assert.ok(files['src/catalog/delivery.ts']);assert.ok(files['src/rigging/export.ts']);
  assert.ok(!files['REBUILD.md']!.includes('All geometry is static'));
  assert.ok(Object.values(files).reduce((sum,value)=>sum+Buffer.byteLength(value),0)<64*1024*1024);
  const trusted=await verifyTrustedRecipe(entry,bytes,path=>readFile(path));assert.equal(trusted.archive.sha256,entry.sha256);
 }
 assert.deepEqual(await buildSourcePackages(output),index);
 for(const entry of index.packages)assert.equal(sha256(await readFile(join(output,entry.url.split('/').at(-1)!))),hashes[entry.id]);
 const trusted=await trustedRecipes(process.cwd(),output);assert.equal(trusted.length,20);
 for(const entry of index.packages)assert.equal(trusted.find(record=>record.id===entry.id)!.archive.sha256,entry.sha256);
});
