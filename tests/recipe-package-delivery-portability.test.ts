import '../scripts/node-platform.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir,mkdtemp } from 'node:fs/promises';
import { join,resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync,spawnSync } from 'node:child_process';
import { buildSourcePackages } from '../scripts/recipe-package.ts';
import { extractPackage } from '../scripts/recipe-check.ts';
import { sha256 } from '../scripts/recipe-package-core.ts';
import { buildAsset,disposeAsset,loadDesign,descriptor } from '../src/catalog/index.ts';
import { DesignSession } from '../src/catalog/session.ts';
import { designInput } from '../src/catalog/appearance.ts';
import { geometrySnapshot } from '../src/lantern/inspect.ts';
import { exportAsset } from '../src/catalog/export.ts';

test('current revision cottage source package preserves validated migration and canonical export bytes',{timeout:120000},async()=>{
  const evidence=resolve('evidence/revision14/packages');await mkdir(evidence,{recursive:true});
  const requested=process.env.SOURCE_DELIVERY_REPLAY_ROOT;
  const output=requested?resolve(requested):await mkdtemp(join(evidence,'cottage-replay-'));
  assert.ok(output.startsWith(evidence+'/'));if(requested)await mkdir(output,{recursive:false});
  const index=await buildSourcePackages(join(output,'candidate'),['cottage']),entry=index.packages[0]!;
  const archive=await readFile(join(output,'candidate',entry.url.split('/').at(-1)!)),directory=join(output,'extracted');
  assert.equal(index.packages.length,1);assert.equal(entry.deliveryRevision,4);await extractPackage(archive,directory);
  const installation=spawnSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:directory,encoding:'utf8',timeout:60000});
  await writeFile(join(output,'installation.log'),installation.stdout+installation.stderr);
  await writeFile(join(output,'installation.json'),JSON.stringify({command:['npm','ci','--ignore-scripts','--no-audit','--no-fund'],status:installation.status,stdout:installation.stdout,stderr:installation.stderr,error:installation.error?.message??null},null,2)+'\n');
  assert.equal(installation.status,0,installation.stdout+installation.stderr);
  const module=await import(pathToFileURL(resolve('public/procedural-modules/cottage/0.5.0/asset.mjs')).href),oldRoot=module.createAsset({width:7.2});
  const old=structuredClone(oldRoot.userData.configuration);module.disposeAsset(oldRoot);
  old.appearance={version:1,palette:'None',shading:'Flat',partColors:{'ridge-cap-0':'#aabbcc','roof-left-band-0':'#112233'}};
  const migrated=loadDesign(old),session=new DesignSession();let reset;
  try{disposeAsset(session.load(old));disposeAsset(session.reset());reset=structuredClone(session.config);}finally{session.dispose();}
  const variants=[['migrated-colored',old],['validated-current',migrated],['fresh',descriptor('cottage').save({width:7.2})],['default',JSON.parse(await readFile(join(directory,'config.json'),'utf8'))],['reset',reset]] as const;
  const results=[];
  for(const [label,input] of variants){
    const config=loadDesign(input),build=buildAsset(config.family,designInput(config));if(config.migration)build.config.migration=config.migration;
    try{
      const configPath=join(directory,label+'.json');await writeFile(configPath,JSON.stringify(input,null,2)+'\n');
      const log=execFileSync('npm',['run','rebuild','--','--config',label+'.json','--out',label+'.glb'],{cwd:directory,encoding:'utf8',timeout:60000});
      const report=JSON.parse(await readFile(join(directory,label+'.glb.report.json'),'utf8'));
      assert.deepEqual(report.config,build.config);assert.deepEqual(report.config.appearance,config.appearance);
      assert.equal(report.geometryHash,sha256(JSON.stringify(geometrySnapshot(build.root))));assert.equal(report.glbHash,sha256(await exportAsset(build)));
      assert.equal(sha256(await readFile(join(directory,label+'.glb'))),report.glbHash);assert.equal(report.source.matchesPackagedSource,true);
      if(label.startsWith('migrated')||label==='validated-current')assert.deepEqual(report.config.migration,migrated.migration);else assert.equal(report.config.migration,undefined);
      await writeFile(join(output,label+'.log'),log);await writeFile(join(output,label+'.report.json'),JSON.stringify(report,null,2)+'\n');
      results.push({label,geometryHash:report.geometryHash,glbHash:report.glbHash,configHash:sha256(JSON.stringify(report.config)),migration:report.config.migration??null});
    }finally{disposeAsset(build);}
  }
  const rejected=[];
  for(const [label,notice] of [['forged',{...migrated.migration,notice:'forged'}],['wrong-target',{...migrated.migration,toVersion:'99.0.0'}]] as const){
    await writeFile(join(directory,label+'.json'),JSON.stringify({...migrated,migration:notice}));
    const run=spawnSync('npm',['run','rebuild','--','--config',label+'.json','--out',label+'.glb'],{cwd:directory,encoding:'utf8',timeout:60000});
    assert.notEqual(run.status,0);await assert.rejects(readFile(join(directory,label+'.glb')),{code:'ENOENT'});
    await writeFile(join(output,label+'.log'),run.stdout+run.stderr);rejected.push({label,status:run.status});
  }
  await writeFile(join(output,'receipt.json'),JSON.stringify({index,archiveSha256:sha256(archive),node:process.versions.node,results,rejected},null,2)+'\n');
});
