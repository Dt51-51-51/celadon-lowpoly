import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute, join } from 'node:path';
import { sourceProvenance } from './provenance.ts';

const recipes=[
  'tests/review-records.test.ts','tests/review-evidence.test.ts','tests/review-defect-fixtures.test.ts','tests/recipe-package-delivery.test.ts',
  'tests/procedural-module.test.ts','tests/procedural-module-immutability.test.ts','tests/semantic-contract.test.ts',
  'tests/f2-catalog.test.ts',
  'tests/f2-palettes.test.ts',
  'tests/recipe-registration.test.ts','tests/recipe-contract.test.ts','tests/recipe-package.test.ts',
  'tests/recipe-render.test.ts','tests/recipe-unity-preparation.test.ts','tests/recipe-source-download.test.ts',
];
const suites:Record<string,string[]>={
  unit:[
    'tests/deploy-allowlist.test.ts','tests/format-reader-robustness.test.ts','tests/catalog-derived-log.test.ts','tests/community.test.ts','tests/cosmetics-collections.test.ts','tests/review-pipeline-v2.test.ts','tests/safety-v1.test.ts','tests/live-queue-page.test.ts','tests/score-cache.test.ts',
    'tests/individual-discovery.test.ts','tests/public-login-redirect.test.ts','tests/public-home-content.test.ts','tests/public-agent-files.test.ts','tests/export-formats.test.ts','tests/hosted-download-labels.test.ts',
    'tests/r2-art-architecture.test.ts','tests/r2-art-tree.test.ts','tests/r2-art-mechanisms.test.ts','tests/r2-art-props-catalog.test.ts','tests/r2-art-furniture-catalog.test.ts','tests/r2-art-organic-catalog.test.ts',
    'tests/r2-current-delivery.test.ts','tests/r2-construction-migration.test.ts','tests/catalog.test.ts','tests/cli.test.ts','tests/export.test.ts','tests/framing.test.ts',
    'tests/recipe-verify.test.ts','tests/measure.test.ts','tests/sculpt-body.test.ts','tests/facet-stone.test.ts','tests/foliage-tuft.test.ts','tests/workshop-placement.test.ts','tests/revision3-thumbnail-inputs.test.ts','tests/revision3-usage.test.ts',
    'tests/revision4-defaults.test.ts','tests/revision4-appearance.test.ts','tests/revision4-unity-preparation.test.ts',...recipes,
  ],
  recipes,
  integration:['tests/r2-mcp-migration.test.ts','tests/mcp.test.ts','tests/recipe-integration.test.ts','tests/revision4-appearance-integration.test.ts'],
  browser:['tests/artifact-recovery-site.test.ts','tests/editor-customization-site.test.ts','tests/polyspoon-technical-header.test.ts','tests/polyspoon-identity-site.test.ts','tests/r2-export-migration-site.test.ts','tests/procedural-module-site.test.ts','tests/recipe-site.test.ts','tests/recipe-source-site.test.ts'],
};
const [mode,...extra]=process.argv.slice(2);
if(!mode || !suites[mode] || extra.length)throw new Error('Choose unit, recipes, integration or browser');
const environment={...process.env};
let output:string|undefined;
if(mode==='integration' || mode==='browser') {
  if(!process.env.TEST_EVIDENCE_ROOT)throw new Error('Set TEST_EVIDENCE_ROOT to a fresh directory under evidence/revision5');
  output=resolve(process.env.TEST_EVIDENCE_ROOT);
  const child=relative(resolve('evidence/revision5'),output);
  if(!child || child.startsWith('..') || isAbsolute(child))throw new Error('TEST_EVIDENCE_ROOT must be under evidence/revision5');
  if(mode==='browser') {
    if(!process.env.RECIPE_SITE_URL)throw new Error('Set RECIPE_SITE_URL to the isolated review server');
    const url=new URL(process.env.RECIPE_SITE_URL);
    if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname) || !['http:','https:'].includes(url.protocol))throw new Error('Browser tests require a local review server');
  }
  await mkdir(output,{recursive:false});
  environment.MCP_TEST_EVIDENCE_ROOT=join(output,'mcp');
  environment.RECIPE_TEST_EVIDENCE_ROOT=join(output,'recipes');
  environment.RECIPE_SITE_EVIDENCE_ROOT=output;
  environment.IDENTITY_SITE_EVIDENCE_ROOT=join(output,'identity');
  environment.TECHNICAL_HEADER_EVIDENCE_ROOT=join(output,'technical-header');
  environment.EDITOR_SITE_EVIDENCE_ROOT=join(output,'editor');
  environment.ARTIFACT_RECOVERY_EVIDENCE_ROOT=join(output,'artifact-recovery');
  environment.PROCEDURAL_SITE_EVIDENCE_ROOT=join(output,'procedural-module');
  environment.APPEARANCE_INTEGRATION_EVIDENCE_ROOT=join(output,'appearance');
}
const before=await sourceProvenance();
const child=spawnSync(process.execPath,['--import','tsx','--import','./tests/register-css-stub.mjs','--test','--test-concurrency=1',...suites[mode]!],{stdio:'inherit',env:environment});
const after=await sourceProvenance();
const stable=before.sourceHash===after.sourceHash;
if(output)await writeFile(join(output,'run.json'),JSON.stringify({mode,files:suites[mode],before,after,stable,status:child.status,signal:child.signal,error:child.error?.message},null,2),{flag:'wx'});
if(child.error)throw child.error;
if(!stable)console.error('Sources changed during the test run; results are not a frozen-source receipt');
process.exitCode=child.status===0 && stable?0:child.status||1;
