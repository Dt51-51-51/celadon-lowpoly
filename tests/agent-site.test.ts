import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium} from 'playwright-core';
import {agentBundleUrl,agentSetupText} from '../src/site/docs.ts';

test('distribution uses an explicit configurable base without inventing a live host',()=>{
 assert.equal(agentBundleUrl('http://127.0.0.1:8765/preview/'),'http://127.0.0.1:8765/preview/agent-bundles/polyspoon-agent-4.zip');
 assert.ok(agentSetupText('codex','https://example.test/toolkit/').includes('https://example.test/toolkit/agent-bundles/polyspoon-agent-4.zip'));
 assert.throws(()=>agentBundleUrl('file:///tmp/'));
});

test('docs serve one archive and app-specific copyable setup on the actual local endpoint',async()=>{
 const server=await createServer({server:{host:'127.0.0.1',port:0},logLevel:'error'});await server.listen();
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/google-chrome',headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
 try{
  const page=await browser.newPage();await page.goto(server.resolvedUrls!.local[0]!+'docs');
  await page.locator('#agent-app').waitFor();
  const origin=new URL(page.url()).origin;
  for(const app of ['codex','claude','cursor','copilot']){
   await page.locator('#agent-app').selectOption(app);
   const text=await page.locator('#agent-setup-text').inputValue();assert.ok(text.includes('--app '+app));assert.ok(text.includes(origin+'/agent-bundles/polyspoon-agent-4.zip'));assert.ok(text.includes('bootstrap.mjs'));
  }
  await page.context().grantPermissions(['clipboard-read','clipboard-write'],{origin});await page.getByRole('button',{name:'Copy setup request'}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),await page.locator('#agent-setup-text').inputValue());
  await page.evaluate(()=>{navigator.clipboard.writeText=async()=>{throw new Error('Simulated clipboard permission failure');};});await page.getByRole('button',{name:'Copy setup request',exact:true}).click();assert.ok((await page.getByRole('status').filter({hasText:'Select and copy'}).textContent())?.includes('Select and copy'));
  const selection=()=>page.locator('#agent-setup-text').evaluate((element:HTMLTextAreaElement)=>({start:element.selectionStart,end:element.selectionEnd,length:element.value.length,focused:document.activeElement===element}));
  assert.deepEqual(await selection(),{start:0,end:(await page.locator('#agent-setup-text').inputValue()).length,length:(await page.locator('#agent-setup-text').inputValue()).length,focused:true});await page.getByRole('button',{name:'Select setup text',exact:true}).click();assert.equal((await selection()).focused,true);
  const url=await page.locator('#agent-bundle-download').getAttribute('href');assert.ok(url);
  const response=await page.request.get(url!);assert.equal(response.status(),200);const bytes=await response.body();assert.equal(bytes.readUInt32LE(0),0x04034b50);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.locator('#agent-setup-text').isVisible());
 }finally{await browser.close();await server.close();}
});
