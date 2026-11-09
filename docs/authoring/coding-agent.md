# Use your agent with Celadon Lowpoly

Point your existing coding assistant or editor at this checkout and give it an asset request, dimensions, style and target when known. The local toolkit does not require a Celadon Lowpoly account, a specific model provider, an API key or remote inference. Your chosen assistant may have its own requirements. Hosted catalog accounts and deployment are not implemented.

Own the complete request-to-usable-asset workflow: setup, discovery, implementation when needed, validation, independent visual review, repair, target verification and export. Deliver the asset, validated saved design, editable source, reproduction inputs and known limits. Do not assign commands or testing to the person making the request. Human feedback is optional; it does not replace your review or become a mandatory gate.

## Select before authoring

Read [the authoring guide](guide.md). Start with `search_assets`/`get_asset` over MCP or `catalog`, `descriptor(id)` and `recipe(id).constraints` in the checkout. Try an existing recipe and meaningful parameter changes first. Extend or author a recipe only when the requested construction cannot be expressed by the current one. Existing catalog coverage and the original simple-planter trial do not prove arbitrary generation.

Current versions come from descriptors and package indexes. Built-ins currently use 0.6.0 and contributed recipes use 1.1.0; use the registry for actual IDs and versioned filenames. Discovery lists individual models at `/catalog`. Type is `presentation.category`, Poseable parts comes from default semantic joints, and Style uses a website-only map with Unclassified for unknown IDs. `kitIds` is legacy compatibility, not a catalog-admission step.

Current model pages use `/asset/:id`, contribution guidance uses `/contribute`, and technical controls use `/editor`. This identity release provides the visitor landing at `/` and guide entry at `/docs`, linking the Markdown documentation. No hosted site is deployed. Do not invent a hosted repository URL or install command for an unpublished package.

## Preserve the saved-design contract

Use the canonical catalog path. Parameters and appearance are separate inputs. `loadDesign` validates family, supported version, requested/applied values and migration notices. Never trust supplied applied values, silently clamp old input or accept unknown keys/versions. Supported prior formats migrate through frozen validators and current construction; historical geometry replay is not promised.

Use `resolveExport({}, savedDesign)` for a saved record. Build from its resolved family/input and preserve its separately validated migration notice on the export configuration. Extracting only requested parameters and appearance with `designInput` loses that notice. Browser GLB, ZIP and static snapshot exports use the shared validated snapshot helper; reset starts a notice-free design.

MCP supports two modes. A new request sends `family`, optional scalar `parameters` and optional top-level `appearance`. With omitted parameters, MCP builds defaults. A saved request sends the full `design`, omits parameters/appearance even if empty, and may omit family or supply its matching family. Both build and export return the validated configuration; only export accepts a filename. Existing output files reject. The CLI's parameter-free export instead selects the first preset. Compare surfaces with the same exact saved input.

Preserve colors on retained semantic part names. New parts use authored colors; removed part colors stay stored and inactive. Indexed layouts can change across revisions. Do not guess aliases that tint unrelated replacement parts. Check actual downloaded requested/applied values. Pending or invalid browser input disables current-design downloads and hides the current snippet. Correct the value, or return to the edited field and press Escape to restore its validated value. The inspector groups controls into Shape, Construction, Materials and Parts.

## Author cohesive construction

Use `examples/recipes/bench/index.ts` and `Recipe` in `src/recipes/types.ts` as references. Before coding, state the silhouette, dimensions, named parts, materials, controls, constraints, failure cases and supported target. Keep new source in an owned `examples/recipes` directory and preserve unrelated work.

Reuse shared geometry and parameter helpers. Do not add code comments or explanatory docstrings. Express intent in names, types and structure. Write behavior tests first, including invalid inputs, boundaries and interacting controls. Register the recipe once in `src/recipes/index.ts`; do not add family switches to UI, catalog, CLI or MCP. Supply original provenance and proposed license scope. Registration does not grant redistribution permission.

Build deterministic geometry with stable semantic IDs, material roles and root-relative anchors. Attach rigid moving pieces to their declared joints and keep supports fixed. Joint metadata and `setJointPose` provide absolute rigid poses, not skinning, clips, IK, physics or rope simulation. Runtime poses do not rewrite saved procedural parameters; recompute bounds when needed.

## Verify and deliver

Use Node.js 22.22.1 and the pinned checkout dependencies. Run relevant checks from `package.json`, your own behavior test and GLB validation. `scripts/test-current.ts` lists suites explicitly; new test files are not discovered automatically. `npm test` already includes the recipe suite, so avoid a duplicate invocation when that scope has passed. Keep historical fixtures and expected hashes intact; distinguish intentional current-version expectations from original-version checks.

For trusted local source, a repeatable verification entry point is:

```sh
npm run recipe:verify -- --family YOUR_ID --request "the actual asset request" --test tests/YOUR_ID.test.ts --out evidence/agent-asset-attempt-01
```

Replace the placeholders with the registered ID and its actual test. Add `--config` to select a saved design. The command runs technical checks, neutral renders, selected export and source packaging with retained logs. It does not generate code, call a model, install dependencies or execute a downloaded package. Inputs must be trusted local source, tests and designs.

Read `report.json`. Only `technical-success` establishes its listed technical checks; `visualReview` and `portableRebuild` remain pending. A running, failed or cancelled report is incomplete. Preserve the first failure and use a fresh directory after repairs. Freeze source and documentation edits during a source-bound run. Then follow [record creation](guide.md#bind-review-evidence) with `recipe:review seal`, `record` and `validate-record`. Use `attempt` to retain terminal failures. Do not invent a successful report to seal an invalid output. Read actual subject cases/views rather than guessing coverage. Eligibility consumes separately trusted application-held records; a record you write does not grant review authority or publication permission.

Inspect the actual selected views and preset images against the request. Record the visible part, view, observation and evidence path. For failed or uncertain findings, identify the defect and proposed correction. Keep technical, visual, portability and executable-source/provenance decisions separate. Record silhouette, scale, support, material hierarchy, control coverage and target-use limits. Repair defects and verify again. Do not turn technical status into aesthetic approval or require the person to provide the missing review.

Deliver `selected.glb`, `selected.design.json`, the selected versioned source ZIP, relevant renders, reports and logs. Source packages contain defaults; browser edits need a separate saved design. Inspect source and dependencies before explicitly rebuilding in an isolated workspace. Pass the same selected design to portable rebuilding. Choose the archive path from the package index. New format 2 packages use delivery revision 2 and `FAMILY-VERSION-source.2.zip` names without changing recipe versions. Their runner preserves a `loadDesign`-validated migration notice; fresh/reset designs have none. Legacy immutable format 1 runners can omit that notice. For those archives, retain the saved design and report the metadata omission separately from geometry/appearance comparisons. Never claim a pending rebuild passed.

A procedural `.mjs` module synchronously builds parameters/appearance with the pinned Three dependency. A Snapshot `.mjs` asynchronously loads a fixed embedded GLB. Preserve their resource ownership and cleanup rules. Verify import and use in the actual requested target: the Unity bridge and recorded fixtures do not guarantee all current cases, materials, animations or gameplay behavior.

Stop before executing unreviewed third-party code, adding dependencies, publishing content or changing license scope. Follow existing [contribution rules](../../CONTRIBUTING.md) and legal notices. This brief does not define new publication or moderation policy.
