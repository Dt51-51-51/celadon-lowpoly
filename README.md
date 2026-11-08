# Polyspoon

**Polyspoon is an open-source, AI-powered 3D asset community and an open alternative to Polyfork.**

🌐 **Live Website:** [https://polyspoon.com](https://polyspoon.com)  
☕ **Support & Donations:** [https://ko-fi.com/ditlied](https://ko-fi.com/ditlied)

---

### I am improving the engine

The Polyfork forest rabbit is on the left. The Polyspoon rabbit is on the right. The sculpt engine builds it as one closed mesh: body, legs, ears and tail share one surface.

The shape is closer. The ears, eyes, mouth and tail still need work. If you can make the generator better, please help. One pull request improves every model that uses it. Start with [Improve the engine](CONTRIBUTING.md#improve-the-engine).

<p align="center">
  <img src="docs/images/rabbit-engine-compare.png" width="820" alt="Polyfork forest rabbit beside the Polyspoon rabbit, three-quarter and side." />
</p>

---

### Featured Procedural Assets

<p align="center">
  <img src="docs/images/cottage.png" width="22%" alt="Cottage" />
  <img src="docs/images/treasure-chest.png" width="22%" alt="Treasure Chest" />
  <img src="docs/images/work-lantern.png" width="22%" alt="Work Lantern" />
  <img src="docs/images/bench.png" width="22%" alt="Bench" />
</p>

---

## Vision

We want to grow a large, open 3D asset community where people and their AI coding agents create, share and improve models together. Polyspoon starts with **low-poly procedural assets** and will expand to assets of every style and level of detail over time. The code, recipes and formats are open, so the community owns what it builds, the engine is OS unlike Polyfork one, and the new version is basically the same quality, I just dont have usage to make 2k + models, so there is where you guys enter, lets improve the engine and make more models.

## What it does

- **Turns recipes into editable 3D models.** A recipe is a small TypeScript program. You can change its parameters, colours and presets, save designs, and rebuild the model reproducibly.
- **Is built for AI agents.** There is an agent toolkit and bundle (`integrations/agents`), a local MCP server, and agent-readable files: a [coding-agent brief](docs/authoring/coding-agent.md), an [authoring guide](docs/authoring/guide.md) and a `*.controls.json` control manifest for each model.
- **Supports several export formats.** GLB is the source of truth. OBJ (zipped with MTL), binary FBX and USDZ are also available, along with saved-design JSON, procedural/snapshot `.mjs` modules and editable source ZIPs. See [export formats](docs/specs/export-formats.md).
- **Works in game engines.** A Unity editor package lives in `integrations/unity`. Godot and other engines import the GLB/OBJ/FBX output (see *Choose an output* below).

## Contribution and moderation

- **Anyone can sign up** through an email magic link and submit models.
- **Every model is reviewed by a person before it is accepted.** Submissions go through a review queue and are published only after an independent human approves them. See [open review](docs/specs/open-review.md) and [review guidance](docs/contributing/review.md).
- **Automated content checks run first.** An isolated processor rebuilds each upload, then renders it from several angles and reads any text on it to flag offensive shapes or words for the reviewer. The check can only flag or hold a model, never approve it. See [review pipeline v2](docs/specs/review-pipeline-v2.md).
- **Members can become moderators.** Accounts have member, moderator and admin roles. Moderators handle the review queue, reports and appeals ([marketplace moderation](docs/specs/marketplace-moderation.md)).

## Community

Creator profiles, following, an activity feed, votes and favourites, comments, notifications, points, levels, badges, leaderboards, cosmetic unlocks and curated collections. See [community](docs/specs/community.md) and [collections](docs/specs/collections.md).

All of these are **purely cosmetic recognition**. Points, levels, cosmetics, collections or popularity never skip review, grant publish rights or confer moderator rights. Moderator access is an explicit role assignment.

## Architecture

- **Frontend:** Vite and Three.js. The local toolkit and editor (`src/`) and the hosted member app (`hosted/`).
- **Hosted API:** a Cloudflare Worker (`server/`) with **D1** (SQLite) for accounts, submissions, reviews, community data and a score cache. Schema lives in `migrations/`.
- **Private object storage** (Supabase Storage, S3-style) holds submitted files and releases. Downloads are served only after authentication.
- **Email:** magic-link sign-in through Resend, with a local mail sink for development.
- **Processor:** `processor/` validates and converts submissions.

## Quick start

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm ci --prefix server --ignore-scripts --no-audit --no-fund   # hosted-service types (wrangler, workers-types)
npm run dev        # local toolkit / editor
npm test           # unit tests
```

The hosted service reads its configuration from environment variables listed in [.env.example](.env.example), which contains names only. No credentials are included in this repository. For deployment, see [release operations](docs/release.md) and [hosted release operations](docs/specs/hosted-release-operations.md).

## Where the docs live

- `docs/authoring/`: the agent brief, authoring guide and procedural modules
- `docs/specs/`: feature specs (formats, review, moderation, community, hosted app, Unity bridge, …)
- `docs/contributing/`: review guidance; also see [CONTRIBUTING.md](CONTRIBUTING.md)
- [docs/licensing.md](docs/licensing.md), [LICENSE](LICENSE) (Apache-2.0)

## Local toolkit details

Polyspoon is a local procedural model toolkit and catalog. Point your own coding agent at this checkout and request an asset. The current catalog contains fourteen model families with editable construction, colors, saved designs and GLB export.

The local toolkit needs no Polyspoon account, provider account, API key or inference service. Your chosen coding assistant may have its own requirements. The separate hosted service implements authenticated catalog access, submissions, review, moderation and verified delivery. It has been checked locally; production deployment is a separate operation. This checkout is not an installable public npm package; use its checked-out sources and pinned dependencies.

## Ask your agent for an asset

Give your agent [the coding-agent brief](docs/authoring/coding-agent.md) and describe the desired model, dimensions, style and target when known. It first selects and customizes an existing recipe. If the request needs different construction, it extends or authors a recipe using the [authoring guide](docs/authoring/guide.md).

The agent owns setup, implementation, checks, renders, independent visual review, repairs and target import/use verification. It delivers the asset, saved design, editable source, reproduction inputs and known limits. The person making the request does not need to run commands or act as a tester. Optional human feedback does not replace those checks or become a mandatory gate.

The existing catalog and recorded cases establish bounded coverage. They do not prove arbitrary model generation or compatibility with every target. The release contains product sources and reproducible inputs; historical research and review workspaces are excluded.

## Run from the checkout

Use Node.js 22.22.1, the version covered by the retained toolchain evidence. From this project directory:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm ci --prefix server --ignore-scripts --no-audit --no-fund   # hosted-service types (wrangler, workers-types)
npm run dev
```

Open the local URL printed by Vite. For a production build and local preview:

```sh
npm run typecheck
node_modules/.bin/vite build
node_modules/.bin/vite preview --host 127.0.0.1 --port 4173 --strictPort
```

This builds the local studio from the existing indexed downloads. `npm run build` regenerates published artifacts for maintainers and rejects changes to immutable source archives; never regenerate published bytes to get a build to pass. See [release preparation](docs/release.md) for a clean snapshot and the hosted build.

The local studio is for local use only. Don't publish it as the hosted service: the hosted build keeps protected app assets behind its authentication gateway. Rigged characters show a static preview in the hosted editor.

## Find an individual model

The current discovery page is `/catalog`. Search matches model titles, IDs and descriptions. Filters and sorting describe individual models:

- **Type** comes from `recipe.presentation.category`.
- **Style** comes from the website-only map in `src/site/discovery.ts`. Unknown model IDs display **Unclassified**; styles are not inferred from titles or added to the recipe schema.
- **Poseable parts** comes from the default build's semantic joint declarations. It means a supported rigid assembly can be posed, not that animation clips exist.
- Sort by name or triangle count. Discovery state is kept in the URL and carried between model pages and the catalog.

`kitIds` remains a legacy compatibility field. It does not organize current discovery. The former named-kit URL redirects to the catalog.

| Route | Current contract |
| --- | --- |
| `/catalog` | Individual model discovery. |
| `/asset/:id` | Customize a registered model, for example `/asset/treasure-chest`. |
| `/contribute` | Local contribution guidance. The separate hosted route provides authenticated submissions. |
| `/editor` | Technical editor and diagnostic controls. |
| `/` | Landing page. |
| `/docs` | Guide entry linking the Markdown documentation, which stays the source of truth. |

## Recipe versions

The six built-ins, `work-lantern`, `cottage`, `tree`, `fence`, `crate` and `boulder`, currently save as **0.6.0**. The contributed `bench`, `planter`, `treasure-chest`, `wheelbarrow`, `stone-well` and `conifer` save as **1.1.0**. Read `descriptor(id).version`, saved `familyVersion` and the current package indexes rather than constructing versioned filenames from an old example.

All use the registry and typed parameter engine. Construction changes include fitted cottage roofing/framing, branching trees, fence members, crate boards and peg seating, boulder shape/burial/moss, lantern housings and handles, furniture courses and supports, and rigid chest/wheelbarrow/well mechanisms. The [authoring guide](docs/authoring/guide.md#extend-construction-and-preserve-relationships) explains their coupled controls.

Units are meters, +Y up and +Z front. Anchors are authored root-relative points. Semantic metadata identifies parts, materials and declared rigid joints. Stable part names support selection and per-part colors. Joint poses do not supply physics, skinning, IK, rope simulation, animation clips or automatic winding. Runtime posing does not rewrite saved procedural parameters; recompute bounds after posing if needed.

## Edit and save

Material controls edit semantic regions. The brush edits a named part. Per-part overrides survive saved designs and session history. If a part disappears, its color remains stored and inactive. New parts keep authored colors. An indexed component can occupy a different position after a recipe revision; there is no automatic mapping from an old broad roof band to its replacement segments.

The inspector groups the full recipe controls into **Shape**, **Construction**, **Materials** and **Parts**. Materials includes exported palette and shading. Parts includes named-part colors and filtered preview visibility. Drag to orbit, scroll to zoom and use framing to fit the model. Each family retains its valid design during the tab session, with undo, redo and reset.

Canonical builders reject unknown keys, invalid domains and unsupported relationships. The browser retains the last valid preview while editing. Pending or invalid input disables current-design downloads and removes the current snippet until the edit is resolved. Correct the value, or return to the edited field and press Escape to restore its validated value. Compare saved requested/applied values with the intended request; a retained preview does not mean an invalid edit was accepted.

Palette, shading and part colors are saved and exported. Palette options include None, authored Reduced4, GameBoy, PICO8, CGA and Mono. None shading preserves lit materials; Flat exports unlit albedo; Toon3bands exports fixed-light bands in vertex colors using `KHR_materials_unlit`. Those bands do not relight dynamically.

Underwater, dither, vertex snapping, outlines, wireframe, pixelation and part visibility are preview effects. Hidden parts remain in complete asset exports.

## Choose an output

| Output | Behavior |
| --- | --- |
| Save design | Versioned JSON with requested/applied values, optional appearance and a validated migration notice when applicable. |
| Export GLB | Complete current asset in meters, with semantic parts, anchors and declared joint groups. |
| Download ZIP | Current GLB, design JSON, static snapshot module, HTML preview and usage notes. |
| Snapshot `.mjs` | Static embedded GLB. Its asynchronous `createAsset()` loads a scene; it is not procedural. |
| Procedural module `.mjs` | Synchronous `createAsset(parameters)` from the selected registered recipe, plus metadata, types, cleanup and rigid-pose APIs. The download starts from family defaults; pass edits explicitly. |
| Generator source ZIP | Editable TypeScript, default configuration, controls, pinned rebuild tooling and notices. It does not capture later browser edits. |

The hosted catalog also offers OBJ (zipped with MTL), binary FBX 7.4, USDZ and a `controls.json` file per model; these carry static geometry only, while GLB keeps rigs and clips. See [export formats](docs/specs/export-formats.md).

The HTML bundle preview loads Three.js from jsDelivr and needs internet. Procedural modules need the pinned Three dependency supplied by the consumer. See [procedural module usage](docs/authoring/procedural-modules.md).

Load validates saved format, family, supported version, requested parameters and exact applied values. Supported older versions use frozen validators before migration. Unknown versions, altered applied records and forged notices reject. Current reloads and browser GLB/ZIP/snapshot exports preserve a validated notice; reset starts a fresh design without one. Migration does not replay old geometry. See [construction migration](docs/construction-migration.md).

For repository-side saved-design export, including appearance and migration metadata:

```sh
npm run export -- --config path/to/model.design.json --out exports/model.glb
```

A saved design determines its family. A conflicting `--family`, or combining `--preset` and `--config`, fails. CLI export can replace an existing output. Without a saved design or explicit preset, CLI export selects the family's first preset, which can differ from defaults.

New source packages use manifest/index format 2 and delivery revision 2, independently of recipe version. Their names end in `-source.2.zip`, for example `cottage-0.6.0-source.2.zip` or `bench-1.1.0-source.2.zip`. Select the actual path from the package index. The revised runner preserves a `loadDesign`-validated migration notice; fresh/reset designs remain notice-free. Immutable format 1 archives keep their original `FAMILY-VERSION.zip` names and historical notice omission. Keep the selected saved design separately and compare exact inputs and toolchains before claiming GLB-byte parity. See [portable rebuilding](docs/authoring/guide.md#distribution).

## Use local MCP

The stateless stdio tools are `search_assets`, `get_asset`, `build_variant` and `export_asset`. An MCP client starts the server and exchanges messages over stdin/stdout:

```sh
node --import tsx src/mcp/stdio.ts --output-dir /absolute/export/directory
```

Configure your MCP client to run `node --import tsx src/mcp/stdio.ts` with this checkout as its working directory. The default output directory is `exports/`. This process adds no HTTP listener. The protocol still uses its existing `woodland-workshop` server identity for compatibility.

For a new parameter request:

```json
{
  "name": "export_asset",
  "arguments": {
    "family": "fence",
    "parameters": {"length": 2, "bays": 1},
    "filename": "fence.glb"
  }
}
```

For a saved design, pass the full parsed record as `arguments.design` to either build or export. Omit `family` or supply the matching family. Do not combine `design` with `parameters` or `appearance`, even empty objects. The canonical saved-design path validates migrations and retains appearance/notices. A new parameter request puts appearance alongside `parameters`, never inside its scalar map.

With a family but omitted parameters, MCP uses family defaults; it does not use the CLI's first-preset fallback. Export returns the resolved configuration. Files must have a simple lowercase GLB basename; existing files and symlinks reject. Omit the filename for a generated name. Restart the process after source or dependency changes.

## Author, verify and deliver

Read [the authoring guide](docs/authoring/guide.md), [coding-agent brief](docs/authoring/coding-agent.md) and [contribution rules](CONTRIBUTING.md). Author one cohesive recipe when existing construction cannot satisfy the request. Register it once in `src/recipes/index.ts`; browser, CLI, MCP and packaging use that registration. Do not add family dispatch branches to those surfaces.

Useful commands from this checkout are:

```sh
npm run typecheck
npm test
npm run test:recipes
npm run validate -- --family bench --out evidence/bench-validation-01
npm run recipe:render -- --family bench --out evidence/bench-render-01
```

`npm test` already includes the recipe suite. Use the separate recipe command when only that scope is needed. Suite files in `scripts/test-current.ts` are explicit; run a newly added test directly until it is deliberately wired. Browser and integration suites require the fresh evidence paths and local URL documented in that runner. Preserve historical fixtures and failed attempts; do not refresh old hashes to fit new construction.

For trusted local authoring, [the verification workflow](docs/authoring/guide.md#one-verification-command) runs the established technical stages and records their results. A successful technical report leaves visual review, portable rebuilding and target import/use as separate checks. The agent performs them and reports their actual outcomes. Use [`recipe:review`](docs/authoring/guide.md#bind-review-evidence) to seal exact successful evidence, retain failed attempts and bind separate review records. Local [eligibility checks](docs/contributing/review.md#local-eligibility-check) depend on separately trusted application-held records; they do not authenticate reviewers or publish content.

A Unity import fixture and Editor launcher live under [integrations/unity](integrations/unity/ImportFixture). Recorded Unity results apply only to the versions and fixtures tested; native Unity checks of the current editor package, terrain and rigged characters are still pending. Verify your own target and keep its import evidence. The humanoid and fox GLBs keep their bound skeletons and idle/walk clips.

Project software, parameter content and third-party dependencies have separate license scopes. Preserve [LICENSE](LICENSE), [NOTICE](NOTICE), [license guidance](docs/licensing.md) and packaged dependency notices. Creating something locally does not publish it or grant redistribution rights.

## Documentation map

- [Authoring guide](docs/authoring/guide.md) and [coding-agent brief](docs/authoring/coding-agent.md)
- [Agent install](docs/authoring/agent-install.md) and [procedural modules](docs/authoring/procedural-modules.md)
- [Contribution review](docs/contributing/review.md) and [licensing](docs/licensing.md)
- [Release preparation](docs/release.md) and [hosted operations](docs/specs/hosted-release-operations.md)
- [Marketplace foundation](docs/specs/marketplace-foundation.md), [moderation](docs/specs/marketplace-moderation.md), [community](docs/specs/community.md), [collections](docs/specs/collections.md)
- [Export formats](docs/specs/export-formats.md), [rigged assets](docs/specs/rigged-assets.md), [environment](docs/specs/environment-foundation.md)
