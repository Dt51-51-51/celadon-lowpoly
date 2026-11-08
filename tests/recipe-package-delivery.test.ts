import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,readFile,writeFile } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { buildSourcePackages } from '../scripts/recipe-package.ts';
import { readPackageZip } from '../scripts/recipe-check.ts';
import { sha256,validatePackageFiles } from '../scripts/recipe-package-core.ts';

const evidence=resolve('evidence/revision14/packages');
test('legacy immutable source archives validate under the frozen delivery contract',async()=>{
  for(const family of ['cottage-0.5.0','cottage-0.6.0','bench-1.1.0']){
    const files=readPackageZip(await readFile('public/recipe-packages/'+family+'.zip'));
    assert.equal(validatePackageFiles(files).formatVersion,1);
    const altered:Record<string,string>={...files,'runner.ts':files['runner.ts']+'\n'};
    const manifest=JSON.parse(altered['manifest.json']!);manifest.files['runner.ts']={bytes:Buffer.byteLength(altered['runner.ts']!),sha256:sha256(altered['runner.ts']!)};manifest.provenance.sourceHash=sha256(JSON.stringify(manifest.files));altered['manifest.json']=JSON.stringify(manifest);
    assert.throws(()=>validatePackageFiles(altered),/Unsupported build\/export entry/);
  }
});

test('delivery revision conflicts preflight all outputs and identical repeats are idempotent',async()=>{
  await assert.rejects(buildSourcePackages(undefined,['cottage']),/explicit candidate output/);
  await mkdir(evidence,{recursive:true});
  const directory=await mkdtemp(join(evidence,'immutable-check-'));
  const legacy=await readFile('public/recipe-packages/cottage-0.6.0.zip');await writeFile(join(directory,'cottage-0.6.0.zip'),legacy);
  const oldIndex='{"retained":"index sentinel"}\n',conflict='immutable conflict';
  await writeFile(join(directory,'index.json'),oldIndex);await writeFile(join(directory,'bench-1.1.0-source.4.zip'),conflict);
  await assert.rejects(buildSourcePackages(directory,['cottage','bench']),/Immutable source artifact conflict/);
  assert.equal(await readFile(join(directory,'index.json'),'utf8'),oldIndex);
  assert.equal(await readFile(join(directory,'bench-1.1.0-source.4.zip'),'utf8'),conflict);
  await assert.rejects(readFile(join(directory,'cottage-0.6.0-source.4.zip')),{code:'ENOENT'});
  const index=await buildSourcePackages(directory,['cottage']);
  assert.equal(index.formatVersion,2);assert.equal(index.packages.length,1);assert.equal(index.packages[0]!.deliveryRevision,4);
  assert.equal(index.packages[0]!.url,'recipe-packages/cottage-0.6.0-source.4.zip');
  const before=await readFile(join(directory,'cottage-0.6.0-source.4.zip')),indexBefore=await readFile(join(directory,'index.json'));
  assert.deepEqual(await buildSourcePackages(directory,['cottage']),index);
  assert.deepEqual(await readFile(join(directory,'cottage-0.6.0-source.4.zip')),before);assert.deepEqual(await readFile(join(directory,'index.json')),indexBefore);
  assert.deepEqual(await readFile(join(directory,'cottage-0.6.0.zip')),legacy);
  const files=readPackageZip(before),manifest=validatePackageFiles(files);assert.equal(manifest.formatVersion,2);assert.equal(manifest.deliveryRevision,4);
  for(const patch of [{deliveryRevision:0},{deliveryRevision:1},{deliveryRevision:5},{formatVersion:1,deliveryRevision:undefined}])assert.throws(()=>validatePackageFiles({...files,'manifest.json':JSON.stringify({...manifest,...patch})}));
  await writeFile(join(evidence,'immutable-check.json'),JSON.stringify({directory,legacySha256:sha256(legacy),artifactSha256:sha256(before),indexSha256:sha256(indexBefore),conflictPreserved:true,idempotent:true,index},null,2)+'\n');
});
