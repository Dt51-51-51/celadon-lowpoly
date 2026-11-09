# Author a Celadon Lowpoly recipe

Point your own agent at this checkout and say “I want X asset,” with dimensions, style and target when known. The agent selects and customizes an existing recipe first. It authors new construction when the catalog cannot meet the request. The agent owns setup, implementation, validation, renders, visual review, repairs, packaging and target checks, then delivers the asset, saved design and editable source. Human testing and feedback are optional.

A recipe is editable source that builds deterministic static geometry from validated parameters. [Bench](../../examples/recipes/bench/index.ts) is a small construction example. A static GLB embedded in an .mjs file is a snapshot, not a recipe. The current toolkit has no mandatory human tester: the agent must produce and inspect the evidence, while human feedback stays optional.

## Select and customize

The registry in `src/recipes/index.ts` contains twelve families. The built-ins currently use 0.6.0 and the six contributed recipes use 1.1.0. See the [current family list](../../README.md#current-recipe-contracts). Read `descriptor(id).version` and the package indexes for actual filenames; do not infer a current version from an old example. Each supplies three presets and the same controls, save/load and export contract.

Read `catalog` and `descriptor(id)` from `src/catalog/index.ts`, then `recipe(id).constraints` from `src/recipes/index.ts`. Through MCP, use `search_assets` followed by `get_asset` for controls, units, defaults, presets and constraints. Choose a preset, merge deliberate parameter changes, and preserve appearance separately. Use `build_variant` to inspect measurements and `export_asset` to export; these calls do not perform visual review.

For a TypeScript module at the repository root, reuse the production catalog path:

```ts
import { buildAsset, disposeAsset } from './src/catalog/index.ts';
import { recipe } from './src/recipes/index.ts';

const preset = recipe('wheelbarrow').descriptor.presets.find(p => p.id === 'garden');
if (!preset) throw new Error('Missing garden preset');
const build = buildAsset('wheelbarrow', { ...preset.parameters, wheelRadius: 0.3, boardCount: 4 });
try {
  console.log(build.config, build.dimensions);
} finally {
  disposeAsset(build);
}
```

Save the validated design for rendering, export and package rebuilds. If parameters already meet the request, no new family is needed. Local use needs no Celadon Lowpoly account. Hosted accounts and submission processing are future work; No hosted site is deployed.

The current `/catalog` discovers individual models. Type comes from `recipe.presentation.category`; Poseable parts comes from semantic joints on the default build. Style is website-only metadata in `src/site/discovery.ts`; unknown IDs get Unclassified. `kitIds` remains legacy compatibility, not catalog organization. Current asset pages use `/asset/:id`; contribution guidance uses `/contribute`, and the technical editor uses `/editor`. This identity release provides the visitor landing at `/` and guide entry at `/docs`. The Markdown guides remain the source documentation. The model inspector provides Shape, Construction, Materials and Parts tabs beside the desktop preview and in a bounded controls area below the narrow preview. Parts supports named-part colors and filtered preview visibility.

## Download a synchronous module

The asset page offers a **Procedural module (.mjs, family default)** alongside editable source and static Snapshot .mjs. The module exports synchronous `createAsset(parameters)`, `disposeAsset(root)`, `setJointPose(root, id, degrees)` and frozen metadata containing controls/defaults/presets and the pinned Three version. Matching `.d.mts` declarations provide parameter types. The current-design snippet and JSON preserve browser edits separately. Omitted parameters use family defaults on every call; a preset must be passed explicitly. Remove returned roots from the scene and dispose their owned resources when finished. A procedural module consumes parameters and appearance, not a complete legacy design or its migration history. See [module usage and cleanup](procedural-modules.md) for overrides, ownership and local browser setup. `npm run recipe:package` publishes modules through the same registered source path.

## Extend construction and preserve relationships

The six recipes under `examples/recipes` use shared typed controls and geometry primitives. Their construction controls change topology or connected dimensions:

| Recipe source | Controls | Preserved relationship |
|---|---|---|
| [Bench](../../examples/recipes/bench/index.ts) | `slatCount` 3–6, `backrest`, `backHeight` | Slats share the seat depth; back posts follow seat and back height. Back height affects construction only with a backrest. |
| [Planter](../../examples/recipes/planter/index.ts) | `boardCount` 2–5, `feet` | Courses share the remaining height with fixed 6 mm gaps; optional feet consume 0.10 m of total height. |
| [Treasure chest](../../examples/recipes/treasure-chest/index.ts) | `boardCount` 2–6, `lidAngle` 0–110 degrees, `latch` | Body stays hollow; the closed solid lid, bands and latch rotate together around the rear hinge. Opening is static geometry. |
| [Wheelbarrow](../../examples/recipes/wheelbarrow/index.ts) | `boardCount` 2–5, `wheelStyle`, `wheelRadius` | Courses preserve tray dimensions. Axle, floor, handles, risers and ground-supported legs follow wheel radius. |
| [Stone well](../../examples/recipes/stone-well/index.ts) | `roof`, `bucket`, `windlass`, `bucketDrop` 0–0.6 m | Roof removal retains posts and mechanism. Bucket requires windlass; rope length follows bucket height. |
| [Conifer](../../examples/recipes/conifer/index.ts) | `tierCount` 5–10, `seed`, `height`, `crownSpread` | Tiers share the crown envelope and taper by normalized position. Seed repeats variation; geometry is fitted to measured height and spread. |

Boulder width/depth are shape scales, not exact bounding-box sizes. Height is measured before burial; burial reduces exposed height. Moss coverage expands continuous upper/shoulder growth. Tree lean is a fraction of height; boulder lean is a fraction of width. Read control input units rather than inferring them from a label.

When extending a box recipe, update its control declaration and builder together. The current planter reserves a fitted rim before calculating wall courses. This construction excerpt assumes `p` is the validated applied parameter record:

```ts
const height = Number(p.height), count = Number(p.boardCount);
const bottom = p.feet ? 0.10 : 0;
const availableCourse = (height - bottom - 0.04 - (count - 1) * 0.006) / count;
const rimHeight = Math.min(0.028, availableCourse * 0.3);
const bodyTop = height - rimHeight;
const boardHeight = (bodyTop + 0.002 - bottom - 0.04 - (count - 1) * 0.006) / count;
```

The rim reduces usable wall height; the 6 mm course gaps remain. The builder also seats posts into the rim and tapers the walls. Read the actual `build` function before changing one relationship in isolation. Update presets, validation cases and saved-version handling with construction changes.

Enforce relationships in parsing as well as control state. Stone well's `relationships` function rejects `bucket: true, windlass: false`; `parse` throws `ParameterError` before construction. Its state uses the same rule and disables unused dimensions:

```ts
const state = parameterState(controls, input, relationships);
const p = parseControls(controls, input);
state.controls.bucketDrop!.enabled = Boolean(p.bucket && p.windlass);
state.controls.roofSize!.enabled = Boolean(p.roof);
```

This is an excerpt from the recipe's state function. UI disabling alone cannot validate CLI, MCP or saved-design inputs. For moving assemblies, follow the chest's `lid-pivot` group and attach all dependent pieces before rotating it. For connected supports, follow the wheelbarrow's shared `floor`, `wheelZ` and `handleY` calculations instead of scaling parts independently.

## Clean start

Use a clean checkout, Node.js 22.22.1, and npm ci --ignore-scripts --no-audit --no-fund. Run npm run typecheck and npm run test:recipes before changes so failures can be attributed. The current test:recipes command runs the bounded recipe suite. Retain tracked evidence/revision5/recipes/legacy-baseline.json, which it reads as a regression fixture. Add your own bounded behavior test and run it explicitly with node --import tsx --test tests/YOUR_ID.test.ts because scripts/test-current.ts lists suite files explicitly; do not run tests/*.test.ts indiscriminately because historical captures require separate review setup. The project itself requires no model credentials, remote inference or paid service. Your chosen coding assistant may have its own requirements.

## Contract and registration

Implement Recipe from src/recipes/types.ts. Supply:

- descriptor: stable ID, semantic version, title, description, controls, defaults, presets, palettes, save and state
- build(input): AssetBuild with root, configuration, named materials, anchors, bounds and dimensions
- load(input): validated saved Design, including version compatibility behavior
- validationCases and integrationCases: arrays of {id, name, parameters}
- constraints: explicit supported relationships and known limits
- presentation: category, order, kitIds and optional preset thumbnail names
- source: a relative TypeScript entry path and its named export

Run `node examples/recipes/starter/scaffold.mjs garden-seat "Garden seat"` as shown in [the starter](../../examples/recipes/starter/README.md). Choose your own ID/title, then replace the copied geometry and controls. Import the recipe once in `src/recipes/index.ts` and include it in the registration list. Use `registry.register` and `recipe(id)`; no new dispatch switches are needed in catalog, UI, CLI or MCP. Use `kitIds: []` for ordinary new individual recipes. The field exists for legacy compatibility and is not an admission step or discovery grouping. Set the actual Type in `presentation.category`; joint declarations determine poseability. The website style map is separate from this recipe contract.

Controls must describe units, bounds, defaults, affected properties and named targets. Use `parseControls`, `parameterState` and primitives from `src/engine/geometry.ts`, such as `profileSolid`, `profiledBeam` and `taperedSweep`. Keep semantic part names stable for per-part colors and user selection. Derive bounds from built geometry. Reject invalid saved family/version/configuration and mismatched applied values. Current recipes accept format-version-1 designs and only their explicitly supported source versions. Built-ins use frozen older validator chains; contributed recipes accept their supported prior 1.0.0 designs before migrating to the current revision. Historical trial files do not imply production compatibility.

Palette `colors` are preview swatches. Without a `colorway` control, each palette must supply `parameters`: a nonempty patch of declared color controls, such as `{'color.bark': '#70523a'}`. The registry rejects missing patches, unknown/non-color keys and invalid colors. Use `applyPalette` from `src/engine/parameters.ts`; it merges that patch, or selects `colorway` and clears prior `color.*` overrides for colorway recipes. Do not derive semantic edits from swatch order.

Recipe.build creates generator-level geometry. The public catalog applies appearance and semantics, then finalizes rig motion when the recipe provides it. Use `buildAsset`, `loadDesign` and `resolveExport` from `src/catalog/index.ts` for canonical loading and export. `designInput` extracts requested parameters and appearance; it deliberately excludes migration metadata. Rebuilding only from that extracted object loses the notice.

For a saved design, use the same resolution pattern as the repository CLI. This root-relative example preserves the separately validated notice:

```ts
import './scripts/node-platform.ts';
import { readFile, writeFile } from 'node:fs/promises';
import { buildAsset, disposeAsset, resolveExport } from './src/catalog/index.ts';
import { exportDeliverable } from './src/catalog/delivery.ts';

const saved = JSON.parse(await readFile('model.design.json', 'utf8'));
const resolved = resolveExport({}, saved);
const build = buildAsset(resolved.family, resolved.input);
try {
  if (resolved.migration) build.config.migration = structuredClone(resolved.migration);
  await writeFile('model.glb', await exportDeliverable(build));
} finally {
  disposeAsset(build);
}
```

Load verifies requested and applied values, supported family/version and the exact permitted notice. Do not accept a caller-supplied notice without canonical validation, clamp old values or trust an unvalidated applied record. Current save/reload retains the notice. Migration means current construction with validated prior intent; it does not replay historical geometry.

The current wrappers recognize these prior recipe versions, in addition to their current version. Each record must pass its original validator and the current construction constraints; recognizing a version is not blanket acceptance of its contents.

| Family | Supported prior versions |
| --- | --- |
| cottage | 0.1.0, 0.2.0, 0.4.0, 0.5.0 |
| tree, fence, crate, boulder | 0.1.0, 0.2.0, 0.3.0, 0.4.0, 0.5.0 |
| work-lantern | historical 1.0.0, 0.2.0, 0.4.0, 0.5.0 |
| bench, planter, treasure-chest, wheelbarrow, stone-well, conifer | 1.0.0 |

Preserve tints on retained semantic names. New parts use authored colors; absent names remain stored and inactive. Indexed layouts can change. The current cottage has additional ridge caps and replaces broad roof-band IDs with course/segment IDs; do not guess a one-to-many color alias. See [migration behavior](../construction-migration.md).

Dispose generated geometry/materials after checks. Browser exports share `src/studio/design-snapshot.ts` for validated notice-preserving snapshots; static snapshots still differ from synchronous procedural modules.

## Verify meaningful behavior

Write behavior tests before the implementation. Cover defaults, each numeric boundary, curated presets, structural toggles and interacting controls. Reject unknown keys, wrong types, nonfinite/out-of-range values, contradictory mechanisms and altered saved `applied` values. Changing a dimension must change the corresponding measured geometry. Repeated builds under a pinned toolchain must reproduce geometry. Saved-design round trips must preserve appearance and validated migration notices. Browser pending or invalid drafts retain the last valid preview but disable current-design downloads and hide the current snippet. Correct the value, or return to the edited field and press Escape. Then compare the downloaded validated configuration with the request.

Run `npm run typecheck`, `npm run test:recipes`, your own behavior test, `npm run validate -- --family YOUR_ID --out evidence/YOUR_ID` and `npm run build`. Commands come from `package.json` and `scripts/test-current.ts`; suite lists are explicit. Freeze source edits before collecting evidence.

Render the selected saved design and curated presets. The agent inspects front, side, rear and three-quarter views for silhouette at intended game scale, proportions, supported joints, material hierarchy and obvious repetition. Check GLB validation, measured bounds, ground contact, triangle/material counts and unique named parts. Repair failures and render a fresh attempt. Verify import/use in the requested target and record its version and tested configuration. Generated `unity-inputs` are fixtures for later checks; producing them does not establish Unity import. Record exact cases and limits rather than claiming all combinations were reviewed.

## Distribution

Add an explicit author/license declaration under your recipe ID in docs/contributing/source-packages.json. Packaging requires that declaration and does not grant visual, code-review or distribution approval. It supports Apache-2.0 software and either Apache-2.0 or CC0-1.0 parameter content; unsupported or missing terms are rejected.

Build packages for the registered recipes with npm run recipe:package. Packaging verifies declarations and integrity, not approval. Use npm run recipe:check -- ZIP --extract NEW_DIRECTORY to validate and extract without execution. In that new directory, review the source, install pinned dependencies with lifecycle scripts disabled, and explicitly run npm run rebuild -- --config config.json --out default.glb. Then repeat with a separately saved changed design. Compare geometry and appearance against the repository build using the same saved config in both exports. CLI export without --config or --preset selects the first preset; source packages contain defaults. Different inputs do not establish an export mismatch.

The package includes its default design. Browser edits require a separate saved design download. Choose the archive through `public/recipe-packages/index.json` for the exact family/version. Recipe versions and source delivery revisions are independent. New packages use manifest/index `formatVersion: 2`, `deliveryRevision: 2` and `FAMILY-VERSION-source.2.zip` names. For example, `cottage-0.6.0-source.2.zip` keeps recipe version 0.6.0. Format 1 archives retain their original `FAMILY-VERSION.zip` names and remain readable. Changed bytes require a new artifact path; packaging rejects replacement at an existing path.

Delivery revision 2 runners preserve the migration notice validated by `loadDesign` in the exported configuration. Fresh/reset inputs remain notice-free; forged notices reject. Retain the selected saved design separately. Legacy format 1 runners can omit the notice when rebuilding a migrated design. For those historical archives, compare geometry, semantic parts and appearance explicitly and report the metadata omission. Earlier portability receipts still cover their original artifacts and do not establish the revised runner. Source downloads are built ahead of serving; the browser does not execute packaging code.


## Neutral renders and recorded coverage

Run npm run recipe:render -- --family YOUR_ID --out FRESH_DIRECTORY to produce the generic seven diagnostic views and preset thumbnails. The renderer refuses an existing output directory. Use a new path per review so earlier evidence is preserved. After reviewing the generated thumbnails, copy each ID-PRESET.png into src/site/previews and set recipe.presentation.thumbnails to map each preset ID to that filename, for example { garden: 'bench-garden.png', park: 'bench-park.png', 'low-seat': 'bench-low-seat.png' }. Use your recipe's actual IDs and filenames. The larger preset-PRESET-oblique.png files remain review evidence; they are not the site thumbnail names.

The catalog-wide source-package path includes all twelve registered families. For each delivery, check both default and changed-design rebuilds against production exports from the same saved inputs, including palette, shading and part colors. If testing an extracted source edit, record the changed source hash and geometry result separately from the original package hash.

Historical package portability evidence used Linux/Node.js 22.22.1 and the original six plus bench. Other native compiler platforms had metadata checks, not runtime verification. The retained [Revision4 Unity evidence](../../evidence/revision4/unity/verification.json) covers the original six only. Separate [Revision5 Unity results](../../evidence/revision5/unity/results.json) cover default, backless, narrow and flat bench fixtures. Neither record establishes Unity compatibility for the five new recipes.

Technical checks alone do not establish visual quality or successful use in the requested target. The agent records its visual and target checks separately; human feedback is optional. The original simple planter trial passed, but it does not establish arbitrary-asset quality or acceptance of the production catalog.

## Command-line-only workflow checks

For a local workflow smoke check, run the scaffold, typecheck, test:recipes, validate, export, package, extraction and rebuild steps. The agent also reviews renders and relevant controls, and verifies import/use for the requested target. A command-line smoke check alone does not establish visual quality or Unity use. The human is not responsible for these checks. Each extracted package installs its own pinned dependencies. The compiler ignores parent tsconfig files, so extraction into a fresh nested directory also works.

MCP has two input modes. With `family` and optional scalar `parameters`, put appearance alongside parameters. Omitted parameters mean family defaults. With `design`, pass the complete saved record and omit parameters/appearance, even empty objects; family may be omitted or must match. Both `build_variant` and `export_asset` resolve saved designs canonically and return their validated configuration/notice. Only export accepts a filename, and existing outputs reject. No preset argument is exposed by these MCP tools.

## One verification command

This first command supports Linux, including cleanup of detached browser descendants. Portable package rebuilding has its own toolchain requirements. After authoring and registering a trusted local recipe, run:

    npm run recipe:verify -- --family bench --request "A garden bench" --test tests/recipe-contract.test.ts --out evidence/authoring/bench-attempt-01

Use your recipe's own behavior test. The bench example uses its existing contract test. The named test must be a regular .test.ts file contained under tests, without symlinks or parent traversal. This executes trusted repository tests; it is not a sandbox for uploaded code. Request text is recorded as provenance and never interpreted as code or a model prompt.

The output must be a fresh directory under the project's evidence directory. Existing directories and symlink paths are rejected. Fix failures and choose a new attempt directory; do not overwrite a failed run. Optional --timeout-ms sets the per-command limit, default 300000 milliseconds, maximum 3600000. SIGINT/SIGTERM cancels the run. Owned subprocess groups, including the isolated renderer's server/browser, are terminated. The local preview on port 4173 is not used.

The command runs typecheck, the existing explicit recipe suite, your named behavior test, family GLB validation cases, seven neutral selected views plus preset images, selected export, source packaging and package integrity checking. It does not install dependencies. Missing installed tooling produces a retained failure. Package generation follows the existing catalog-wide packaging path and can fail on another registered recipe's missing declaration.

Without --config, selected.design.json records the descriptor defaults. With --config path/to/saved.design.json, it records the validated selected design, including appearance. Export and rendering both consume that exact saved file. A conflicting family is rejected before output creation. Config inputs must be regular files within this checkout.

report.json is written atomically after each stage. It records request, recipe/version, selected design, source and dependency-lock hashes, verification-input hashes (including tests), argv, exit/signal/timeout outcomes, separate stdout/stderr logs, first failure, artifact hashes and next action. Sources and verification inputs are checked between stages and at completion. Freeze concurrent edits, including contribution documentation, before accepting the receipt. A failed, cancelled, interrupted or still-running report never establishes technical success.

A successful run reports technical-success and visualReview: pending. Open the actual renders and record the part, view, observation and evidence path. Failed or uncertain findings state the defect and proposed correction. Preserve rejected attempts and rerun after repair. Keep technical, visual, portability and executable-source/provenance decisions separate. The software does not grant aesthetic acceptance. Target import/use remains separate.

Delivery files are selected.glb, selected.design.json, packages/FAMILY-VERSION-source.2.zip, renders and logs. The source ZIP contains its canonical default config, which may differ from the selected design. After inspecting the package with recipe:check and reviewing its code, explicitly extract to a fresh workspace. Dependency installation and rebuilding remain separate deliberate actions:

    npm run recipe:check -- evidence/authoring/bench-attempt-01/packages/FAMILY-VERSION-source.2.zip --extract evidence/authoring/bench-rebuild-01

In the extracted directory, after inspection and dependency setup, run the following with the actual path to the selected design:

    npm run rebuild -- --config /absolute/path/to/bench-attempt-01/selected.design.json --out selected-rebuilt.glb

Use the pinned toolchain and follow REBUILD.md. Compare rebuilt GLB SHA-256 with `report.json` `checks.selectedGlbHash` only when the selected inputs, metadata and pinned toolchain are equivalent. Compare configuration, semantic parts, geometry and appearance separately. When using a legacy format 1 runner, retain and report any omitted migration notice instead of declaring exact parity. Delivery revision 2 preserves the validated notice. Tiny cross-runtime material-number serialization differences can also change JSON bytes; preserve exact deltas rather than classifying them as geometry changes. Retain the rebuild command, logs, report and comparison outcome separately. The verification command leaves portableRebuild: pending and never executes extracted or uploaded generators automatically.

See [semantic IDs, input/display units, anchors and runtime joints](semantic-contract.md) for the canonical build/module/GLB contract and editable delivery mapping.


## Bind review evidence

After a source-frozen successful verification run, seal its exact evidence and create records from actual inspections. Run from the project root. The following paths are examples; use the real run and a new review directory:

```sh
npm run recipe:review -- seal --run evidence/authoring/bench-attempt-01 --out evidence/authoring/bench-review-01/subject.json
npm run recipe:review -- record --subject evidence/authoring/bench-review-01/subject.json --input evidence/authoring/bench-review-01/visual-draft.json --out evidence/authoring/bench-review-01/visual-record.json
npm run recipe:review -- validate-record --subject evidence/authoring/bench-review-01/subject.json --record evidence/authoring/bench-review-01/visual-record.json
```

The subject binds the request, selected design, recipe/delivery versions, source, lock, toolchain, control cases, terminal report and artifact/view hashes. `seal` rejects failed, cancelled, pending, stale or changed evidence. A bounded successful run remains bounded; it does not establish full recipe verification. Preserve a terminal failed or cancelled run separately:

```sh
npm run recipe:review -- attempt --run evidence/authoring/bench-failed-01 --out evidence/authoring/bench-review-01/failed-attempt.json
```

Outputs must be new paths under `evidence/`, outside the sealed run. Existing files reject. Repairs require fresh verification, a fresh subject and new records. Do not edit the sealed run to add review notes.

Prepare the draft using [the review types](../../src/review/types.ts). It contains `category`, `reviewerId`, `decision`, case `coverage`, `findings` and explicit `limits`. Optional `attachments` bind later evidence by project-relative path, SHA-256 and byte count. Existing artifact paths are relative to the subject's run. Each finding includes `caseId`, an actual `part` or `model`/`package`, `view`, evidence paths, `observation` and `decision`. Decisions are `pass`, `fail` or `uncertain`; failed findings require `defect` and `proposedCorrection`. Record the missing evidence and proposed correction for uncertainty too. A passing record cannot contain unresolved findings.

Use the subject's actual coverage. Case IDs are `selected`, `validation:ID` and `preset:ID` where present. Visual findings must name an exercised case/view and its actual image evidence. Other categories use fixed inspection views:

| Category | Finding view |
| --- | --- |
| `technical` | `technical` |
| `visual` | Actual captured view, such as `oblique`. |
| `portability` | `portable` |
| `executable-source` | `source` |

Passing executable-source records need `sourceInspection.inspected` containing `dependencies`, `imports`, `licenses`, `provenance` and `redistribution`, plus a nonempty `redistributionScope`. Failed or uncertain records can list only the areas actually inspected, with a nonempty list and explicit redistribution scope. Do not claim completed inspection for unchecked areas. Inspection records do not execute or sandbox external source.

Passing executable-source and portability findings must reference the actual selected source ZIP from the subject's artifacts. A passing portability record must also reference `selected.glb` and at least one digest-bound replay attachment. Retain the independent rebuild inputs, commands, logs and comparison result. An arbitrary attachment does not establish that rebuilding or comparison occurred.

Calling `npm run recipe:review` without a verb lists the supported verbs and exits 1. Exit 1 also reports invalid inputs or evidence errors. Eligibility exits 2 for valid but ineligible evidence. Exit 0 means the command completed, not that an asset was published or every recorded decision passed. See [publication eligibility boundaries](../contributing/review.md#local-eligibility-check) for the separately trusted store.

## Semantic parts, rigid poses and target limits

Built assets expose stable part IDs, material roles, root-relative authored anchors and optional rigid revolute joint groups. The authored ground reference is not a recomputed bounding-box center. Attach all moving parts to their declared joint, and keep fixed supports outside it. `setJointPose` applies an absolute degree angle to a live root, updates its joint metadata and leaves saved procedural parameters unchanged. Anchors do not automatically track poses; recompute bounds when runtime posing changes them.

These declarations supply rigid articulation, not skinning, physics, IK, clips, rope dynamics or automatic winding. A poseable discovery label describes default semantic joints; a variant can remove the corresponding assembly. Do not promise animation assets merely because that label is present.

The Unity editor bridge and fixtures live under [integrations/unity](../../integrations/unity/). Their receipts cover specific versions, inputs and target configurations. Importable GLB nodes do not automatically become usable Unity animations or gameplay joints. The agent must verify the requested import, materials, scale and use in the actual target, and record untested combinations honestly. Rendering and technical checks do not establish visual acceptance; independently inspect the originals against the requested result.

## Rigged environment placements

Rigged environment GLBs keep skinned meshes at the scene root. Use skeleton bone ancestry or each mesh's `extras.placementId` to identify its owning placement. Moving or rotating the placement wrapper moves its rig through the bones.

Hiding the placement wrapper alone does not hide the scene-root skinned meshes. Hide the associated meshes explicitly when hiding that placement.
