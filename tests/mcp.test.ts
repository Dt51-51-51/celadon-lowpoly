import { recipe } from '../src/recipes/index.ts';
import {constructionCases} from './revision3-construction-cases.ts';
import '../scripts/node-platform.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { mkdir, mkdtemp, readFile, writeFile, symlink, readdir } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBytes } from 'gltf-validator';
import { catalog, buildAsset, disposeAsset } from '../src/catalog/index.ts';
import { exportDeliverable } from '../src/catalog/delivery.ts';
import { measurements } from '../src/catalog/measure.ts';
import { sha256 } from '../scripts/provenance.ts';
import { assertSameBytes } from './same-bytes.ts';

const project=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const evidenceRoot=process.env.MCP_TEST_EVIDENCE_ROOT;
assert.ok(evidenceRoot,'Run npm run test:integration with a fresh TEST_EVIDENCE_ROOT');
assert.ok(resolve(evidenceRoot).startsWith(resolve(project,'evidence/revision5')+'/'),'MCP evidence must stay under evidence/revision5');
test('real v2 stdio client: four tools, all families, exact exports and filesystem boundaries', {timeout:60000}, async () => {
  const evidence=evidenceRoot;await mkdir(evidence,{recursive:true});
  const run=await mkdtemp(join(evidence,'protocol-')), output=join(run,'exports'), cwd=join(run,'caller');
  await mkdir(cwd);await mkdir(output);
  const config=JSON.parse(await readFile(join(project,'examples/mcp-client.json'),'utf8')).mcpServers['woodland-workshop'];
  const args=[...config.args];args[args.indexOf('--output-dir')+1]=output;
  const transport=new StdioClientTransport({command:config.command,args,cwd,stderr:'pipe'});
  const client=new Client({name:'woodland-protocol-test',version:'1.0.0'});
  const stderr:string[]=[], protocolErrors:string[]=[], exchanges:unknown[]=[];
  transport.stderr?.on('data',chunk=>stderr.push(String(chunk)));
  client.onerror=error=>protocolErrors.push(error.message);
  async function call(name:string,args:Record<string,unknown>) {
    const response=await client.callTool({name,arguments:args});
    exchanges.push({name,arguments:args,response});
    assert.ok(!response.isError,JSON.stringify(response));
    const text=response.content.find(c=>c.type==='text');
    assert.ok(text && text.type==='text');
    const data=JSON.parse(text.text);
    assert.deepEqual(response.structuredContent,data);
    return data;
  }
  async function reject(name:string,args:Record<string,unknown>) {
    try {
      const response=await client.callTool({name,arguments:args});
      exchanges.push({name,arguments:args,response});
      assert.equal(response.isError,true,JSON.stringify(response));
    } catch(error) {
      if (error instanceof assert.AssertionError) throw error;
      exchanges.push({name,arguments:args,protocolError:String(error)});
    }
  }
  try {
    await client.connect(transport);
    assert.equal(client.getServerVersion()?.name,'woodland-workshop');
    const listed=await client.listTools();
    exchanges.push({initialize:client.getServerVersion(),tools:listed.tools});
    assert.deepEqual(listed.tools.map(t=>t.name).sort(),['build_variant','export_asset','get_asset','search_assets']);
    for(const tool of listed.tools) {
      assert.ok(tool.description && tool.description.length>20);
      assert.equal(tool.inputSchema.additionalProperties,false);
      assert.equal(tool.annotations?.openWorldHint,false);
    }
    const search=await call('search_assets',{query:''});assert.deepEqual(search.assets.map((a:{id:string})=>a.id).sort(),catalog.map(d=>d.id).sort());
    assert.deepEqual((await call('search_assets',{query:'LANTERN'})).assets.map((a:{id:string})=>a.id),['work-lantern']);
    assert.equal((await call('search_assets',{query:'no-such-item'})).assets.length,0);
    for(const d of catalog) {
      const asset=await call('get_asset',{family:d.id});
      assert.equal(asset.version,d.version);assert.equal(asset.presets.length,d.presets.length);
      assert.ok(asset.constraints.length && asset.materialRoles.length);
      if(d.id==='work-lantern') {
        const width=asset.controls.find((c:{key:string})=>c.key==='bodyWidth');
        assert.equal(width.inputUnit,'m');assert.equal(width.displayUnit,'cm');
        assert.equal(width.min,0.22);assert.equal(width.max,0.44);assert.equal(width.step,0.001);
        assert.equal(asset.defaults.bodyWidth,0.32);
      }
      if(d.id==='boulder') {
        const lean=asset.controls.find((c:{key:string})=>c.key==='lean');
        assert.equal(lean.inputUnit,'dimensionless');assert.equal(lean.displayUnit,'ratio');
      }
      const baseline=await call('build_variant',{family:d.id});
      assert.deepEqual(baseline.configuration,d.save({}));assert.deepEqual(asset.semantics,baseline.semantics);assert.deepEqual(asset.controls,baseline.semantics.controls);
      if(d.id==='cottage') {
        const customized=await call('build_variant',{family:d.id,parameters:{chimney:false,beamWeight:'light','color.roof':'#123456'}});
        assert.equal(customized.configuration.applied.chimney,false);
        assert.equal(customized.configuration.applied.beamWeight,'light');
        assert.equal(customized.configuration.applied['color.roof'],'#123456');
        await reject('build_variant',{family:d.id,parameters:{chimney:'false'}});
      }
      if(d.id==='work-lantern') {
        const legacy=buildAsset(d.id,d.presets[0]!.parameters);
        try {assert.equal(legacy.config.familyVersion,d.version);assert.notEqual(sha256(await exportDeliverable(legacy)),'64aa538d2f595c7551e97305edcf4176d710385c093bb5ae53d01fa719dddb3f');}
        finally {disposeAsset(legacy);}
      }
      const construction=constructionCases[d.id]??recipe(d.id).validationCases.find(c=>Object.keys(c.parameters).length)?.parameters??{};
      for(const key of Object.keys(construction))assert.ok(asset.controls.some((c:{key:string})=>c.key===key),d.id+'/'+key);
      const colorway=d.controls.find(c=>c.key==='colorway');
      const palette=colorway?.kind==='choice'&&colorway.options.some(o=>o.value==='ember')?'ember':d.defaults.colorway;
      const parameters={...(palette?{colorway:palette}:{}),...construction};
      for(const [key,value] of Object.entries(construction))if(typeof value==='string')await reject('build_variant',{family:d.id,parameters:{[key]:'unsupported-choice'}});
      const variant=await call('build_variant',{family:d.id,parameters});
      assert.deepEqual(variant.configuration,d.save(parameters));
      for(const [key,value] of Object.entries(construction))assert.equal(variant.configuration.applied[key],value);
      const name=d.id+'.glb';
      const exported=await call('export_asset',{family:d.id,parameters,filename:name});
      assert.equal(exported.path,join(output,name));
      const bytes=await readFile(exported.path);
      assert.equal(exported.sha256,sha256(bytes));assert.equal(exported.bytes,bytes.length);
      assert.equal(exported.configSha256,sha256(JSON.stringify(exported.configuration)));
      assert.ok(exported.provenance.sourceHash && exported.provenance.lockHash);
      assert.deepEqual(Object.keys(exported.provenance).sort(),['lockHash','node','sourceHash']);
      assert.equal(exported.measurements,undefined);assert.equal(variant.measurements,undefined);
      const validation=await validateBytes(bytes);assert.equal(validation.issues.numErrors,0);assert.equal(validation.issues.numWarnings,0);
      const build=buildAsset(d.id,parameters);
      try {
        assertSameBytes(bytes,await exportDeliverable(build),'variant export');assert.deepEqual(variant.semantics,build.semantics);
        const expected=measurements(build);
        assert.deepEqual(variant.dimensions,build.dimensions.toArray());
        assert.deepEqual(variant.dimensionsOrder,['width','height','depth']);assert.equal(variant.dimensionsUnit,'m');
        assert.equal(variant.triangles,expected.triangles);
        assert.equal(variant.parts,expected.parts.length);assert.deepEqual(variant.materialRoles,Object.keys(build.materials));
        const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
        const exportedRoot=build.root.userData.openpolyRig?gltf.scenes[gltf.scene??0]:gltf.nodes.find((n:{name:string})=>n.name===d.id);assert.ok(exportedRoot);assert.deepEqual(exportedRoot.extras.configuration,d.save(parameters));
        for(const material of expected.materials) {
          const m=gltf.materials.find((m:{name:string})=>m.name===material.name);
          assert.deepEqual(m.pbrMetallicRoughness.baseColorFactor,Object.values(material.linearColor));
        }
      } finally {disposeAsset(build);}
      await reject('export_asset',{family:d.id,parameters,filename:name});
      assert.equal(sha256(await readFile(exported.path)),exported.sha256);
    }
    for(const [name,args] of [
      ['search_assets',{query:2}],['search_assets',{extra:true}],['get_asset',{family:'unknown'}],['get_asset',{family:'tree',extra:true}],
      ['build_variant',{family:'crate',parameters:{height:1.2,width:0.45}}],
      ['build_variant',{family:'tree',parameters:{seed:1.5}}],
      ['build_variant',{family:'work-lantern',parameters:{bodyWidth:0.22,bodyHeight:0.36}}],
      ['build_variant',{family:'cottage',parameters:{width:3.6,roofRise:2}}],
      ['build_variant',{family:'tree',parameters:{height:6,spread:2.4}}],
      ['build_variant',{family:'fence',parameters:{length:6,bays:1}}],
      ['build_variant',{family:'boulder',parameters:{width:0.6,height:1.8}}],
      ['build_variant',{family:'tree',parameters:{height:'4'}}],
      ['build_variant',{family:'tree',parameters:{unknown:1}}],
      ['build_variant',{family:'tree',parameters:null}],
      ['build_variant',{family:'tree',parameters:[]}],
      ['export_asset',{family:'tree',parameters:{height:100},filename:'invalid.glb'}],
      ['export_asset',{family:'tree',filename:'../escape.glb'}],
      ['export_asset',{family:'tree',filename:join(run,'absolute.glb')}],
      ['export_asset',{family:'tree',filename:'nested/path.glb'}],
      ['export_asset',{family:'tree',filename:'back\\slash.glb'}],
      ['export_asset',{family:'tree',filename:'asset.json'}],
      ['export_asset',{family:'tree',filename:'x.glb',outputDir:run}],
    ] as Array<[string,Record<string,unknown>]>) await reject(name,args);
    const sentinel=join(run,'sentinel.glb');await writeFile(sentinel,'untouched');
    await symlink(sentinel,join(output,'symlink.glb'));
    await reject('export_asset',{family:'tree',filename:'symlink.glb'});
    assert.equal(await readFile(sentinel,'utf8'),'untouched');
    const races=await Promise.all([client.callTool({name:'export_asset',arguments:{family:'tree',filename:'race.glb'}}),client.callTool({name:'export_asset',arguments:{family:'crate',filename:'race.glb'}})]);
    assert.equal(races.filter(r=>!r.isError).length,1);
    exchanges.push({collisionRace:races});
    const auto1=await call('export_asset',{family:'boulder'}),auto2=await call('export_asset',{family:'boulder'});
    assert.notEqual(auto1.path,auto2.path);
    for (const name of (await readdir(output)).filter(name=>name.endsWith('.glb') && name!=='symlink.glb')) {
      const validation=await validateBytes(await readFile(join(output,name)));
      assert.equal(validation.issues.numErrors,0);assert.equal(validation.issues.numWarnings,0);
    }
    assert.equal((await readdir(output)).length,catalog.length+4);
    assert.deepEqual(await readdir(cwd),[]);
    assert.deepEqual(protocolErrors,[]);
    assert.equal(stderr.join(''),'');
    await writeFile(join(run,'exchanges.json'),JSON.stringify(exchanges,null,2));
    await writeFile(join(evidence,'latest-protocol.json'),JSON.stringify({run,output,cwd,server:client.getServerVersion(),tools:listed.tools,exchanges:exchanges.length,stderr,protocolErrors,checks:{families:catalog.length,realGlbs:catalog.length+3,versionedConstructionUpgrade:true,remainingFamilyConstruction:true,invalidConstructionChoices:true,colors:true,configurations:true,containment:true,exclusiveCreation:true,otherCwd:true}},null,2));
  } finally {await client.close();await transport.close();}
});

test('default project output and invalid startup arguments work from another cwd', {timeout:30000}, async () => {
  const evidence=evidenceRoot;await mkdir(evidence,{recursive:true});
  const cwd=await mkdtemp(join(evidence,'startup-'));
  const config=JSON.parse(await readFile(join(project,'examples/mcp-client.json'),'utf8')).mcpServers['woodland-workshop'];
  const args=config.args.slice(0,config.args.indexOf('--output-dir'));
  const transport=new StdioClientTransport({command:config.command,args,cwd,stderr:'pipe'});
  const client=new Client({name:'woodland-default-test',version:'1.0.0'});
  try {
    await client.connect(transport);
    const response=await client.callTool({name:'export_asset',arguments:{family:'crate'}});
    assert.ok(!response.isError);
    const data=response.structuredContent as Record<string,unknown>;
    assert.equal(dirname(String(data.path)),join(project,'exports'));
    const bytes=await readFile(String(data.path));
    assert.equal(sha256(bytes),data.sha256);
    const validation=await validateBytes(bytes);
    assert.equal(validation.issues.numErrors,0);assert.equal(validation.issues.numWarnings,0);
    await writeFile(join(evidence,'default-output.json'),JSON.stringify(data,null,2));
    const {rename}=await import('node:fs/promises');
    await rename(String(data.path),join(cwd,'default-export.glb'));
  } finally {await client.close();await transport.close();}
  const {spawnSync}=await import('node:child_process');
  for (const extra of [['--output-dir','relative'],['--bad','value'],['--output-dir']]) {
    const child=spawnSync(config.command,[...args,...extra],{cwd,encoding:'utf8',timeout:10000});
    assert.equal(child.status,1);
    assert.equal(child.stdout,'');
    assert.match(child.stderr,/Usage:/);
  }
  assert.deepEqual(await readdir(cwd),['default-export.glb']);
});
