import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {allowlistFromManifest,htmlReferences,cssReferences,missingFromAllowlist,deriveAndCheckPublicFiles} from '../scripts/public-allowlist.ts';
import {smokePlan,runSmoke,preflightConfiguration} from '../scripts/deploy-preflight.ts';

const html='<!doctype html><link rel="icon" href="/brand/logo.png"><script type="module" src="/public-assets/index-NEW.js"></script><link rel="stylesheet" href="/public-assets/index-NEW.css"><a href="https://x.org">x</a>';
async function release(files:string[],body=html,css='body{background:url(../brand/bg.png)}'){
 const root=await mkdtemp(join(tmpdir(),'allow-'));for(const f of files){await mkdir(join(root,'public',f,'..'),{recursive:true});await writeFile(join(root,'public',f),f==='index.html'?body:f.endsWith('.css')?css:'x');}
 await writeFile(join(root,'public-files.json'),JSON.stringify({formatVersion:1,files:Object.fromEntries(files.map(f=>[f,{}]))}));return root;
}
test('allowlist is derived from the manifest, sorted and slash-prefixed',()=>{
 assert.deepEqual(allowlistFromManifest({files:{'public-assets/b.js':{},'index.html':{}}}),['/index.html','/public-assets/b.js']);
 assert.throws(()=>allowlistFromManifest({files:{'a.js':{}}}),/invalid_public_manifest/);
});
test('HTML and CSS references are extracted, external links ignored',()=>{
 assert.deepEqual(htmlReferences(html),['/brand/logo.png','/public-assets/index-NEW.css','/public-assets/index-NEW.js']);
 assert.deepEqual(cssReferences('a{b:url("../brand/bg.png?v=1")}c{d:url(data:x)}','/public-assets/i.css'),['/brand/bg.png']);
 assert.deepEqual(missingFromAllowlist(['/a','/b'],['/a']),['/b']);
});
test('current release passes; renamed hashed assets are caught',async()=>{
 const ok=await release(['index.html','brand/logo.png','brand/bg.png','public-assets/index-NEW.js','public-assets/index-NEW.css']);
 const result=await deriveAndCheckPublicFiles(ok);assert.ok(result.allowlist.includes('/public-assets/index-NEW.js'));assert.ok(result.references.includes('/brand/bg.png'));
 const stale=await release(['index.html','brand/logo.png','brand/bg.png','public-assets/index-OLD.js','public-assets/index-NEW.css']);
 await assert.rejects(deriveAndCheckPublicFiles(stale),/public_allowlist_missing:\/public-assets\/index-NEW\.js/);
 const cssGap=await release(['index.html','brand/logo.png','public-assets/index-NEW.js','public-assets/index-NEW.css']);
 await assert.rejects(deriveAndCheckPublicFiles(cssGap),/public_allowlist_missing:\/brand\/bg\.png/);
});
test('preflight config only swaps host; smoke plan and runner',async()=>{
 const base={routes:[{pattern:'polyspoon.com',custom_domain:true}],vars:{APP_ORIGIN:'https://polyspoon.com',PUBLIC_FILES:'["/index.html"]'}} as never;
 const c=preflightConfiguration(base) as {routes:unknown;vars:Record<string,string>};
 assert.deepEqual(c.routes,[{pattern:'preflight.polyspoon.com',custom_domain:true}]);assert.equal(c.vars.APP_ORIGIN,'https://preflight.polyspoon.com');assert.equal(c.vars.PUBLIC_FILES,'["/index.html"]');
 const plan=smokePlan(['/public-assets/a.js']);assert.deepEqual(plan.map(p=>p.path),['/','/docs','/public-assets/a.js','/api/catalog']);assert.equal(plan.at(-1)!.status,200);
 const fake=(async(url:URL)=>new Response(null,{status:url.pathname==='/public-assets/a.js'?404:200})) as unknown as typeof fetch;
 assert.deepEqual(await runSmoke('https://h',plan,fake),['/public-assets/a.js expected 200 got 404']);
});
test('production deploy applies only migrations the database has not recorded',async()=>{
 const {pendingMigrations}=await import('../scripts/deploy-production.ts');
 assert.deepEqual(pendingMigrations(['0021_model_stats.sql','README.md','0019_catalog_presentation.sql','0020_catalog_model_types.sql'],['0019_catalog_presentation.sql','0020_catalog_model_types.sql']),['0021_model_stats.sql']);
 assert.deepEqual(pendingMigrations(['0019_catalog_presentation.sql'],['0019_catalog_presentation.sql']),[]);
});
