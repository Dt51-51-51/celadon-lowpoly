import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {hero,pillars,howItWorks,contribute,moderation,comparison,faq,repository} from '../hosted/public/content.ts';

const all=JSON.stringify({hero,pillars,howItWorks,contribute,moderation,comparison,faq});

test('public landing explains the project, the open-source alternative, contribution, review and moderation',()=>{
 assert.match(hero.lead,/open-source alternative to Polyfork/);
 for(const engine of ['Unity','Godot','Blender','three.js'])assert.ok(all.includes(engine),engine);
 assert.equal(howItWorks.length,4);
 assert.ok(contribute.some(step=>/every model/i.test(step.body)&&/human/i.test(step.body)),'every model human review');
 assert.doesNotMatch(all,/first model/i,'no first-model-only review claim');
 assert.ok(contribute.some(step=>/cannot review your own/i.test(step.body)),'no self review');
 assert.ok(moderation.some(step=>/moderat/i.test(step.title)&&/invited/i.test(step.body)),'moderator path');
 assert.ok(faq.some(item=>/moderator/i.test(item.question)));
 assert.ok(faq.length>=6&&faq.every(item=>item.question.endsWith('?')&&item.answer.length>40));
 assert.ok(comparison.every(row=>row.length===3&&row.every(cell=>cell.trim())));
 assert.match(all,/Apache-2\.0/);
});

test('public landing copy stays free of private catalog imports and unverifiable live claims',async()=>{
 const sources=await readFile('hosted/public/content.ts','utf8')+await readFile('hosted/public/main.ts','utf8');
 assert.doesNotMatch(sources,/from '\.\.\/\.\.\/src\/(catalog|recipes|families|studio)/);
 assert.ok(Object.values(repository).every(url=>url.startsWith('https://')&&url.includes('DITlieD/polyspoon')));
 assert.ok(sources.includes("'/agent-bundles/polyspoon-agent-4.zip'"));
});
