# Install the Polyspoon agent bundle

On the local site's `/docs` page, select your agent app and copy the setup request. Add your model request before sending it. Your agent downloads one archive, inspects it, installs the project skill and bootstraps the local toolkit. Select setup text is available for manual copying. The optional Markdown guides are references, not three required downloads.

The single archive is `agent-bundles/polyspoon-agent-4.zip`, relative to the site's base URL. With a local Vite server, use that server's actual origin. `VITE_POLYSPOON_ORIGIN` can set an explicit HTTP(S) distribution base, including a path prefix. The copyable request and download link use the same base. Routes on `polyspoon.com` are future deployment paths; no hosted installer or protected catalog is claimed to be live.

## One archive, project installation

Use Node.js 22.22.1 and npm 10 or later. Extract the archive into a fresh `polyspoon-agent-setup` directory. Review `install.mjs`, `bootstrap.mjs`, `runtime.mjs`, `support.mjs`, `bundle.json`, the toolkit archive and license notices before executing them. Hashes check byte consistency, not authorship or execution safety.

From the destination project root:

```sh
node polyspoon-agent-setup/install.mjs --app codex --project .
node .polyspoon/bootstrap.mjs
node .polyspoon/runtime.mjs catalog
node .polyspoon/runtime.mjs build --family bench --parameters '{"width":2.2,"backrest":false}' --out exports/bench-01
```

Replace `codex` with your selected adapter. Extraction is a normal archive operation, not an app-specific install command. The installer requires an existing project directory and rejects home/filesystem-root destinations and symlinks along managed project paths. It never edits your global skills, app settings or unrelated project instructions.

| Adapter | Project destination | Official support reference |
| --- | --- | --- |
| `codex` | `.agents/skills/polyspoon/SKILL.md` | [Codex local skills](https://learn.chatgpt.com/docs/build-skills) |
| `claude` | `.claude/skills/polyspoon/SKILL.md` | [Claude Code skills](https://code.claude.com/docs/en/skills) |
| `cursor` | `.cursor/skills/polyspoon/SKILL.md` | [Cursor skills](https://cursor.com/docs/skills) |
| `copilot` | `.github/skills/polyspoon/SKILL.md` | [GitHub Copilot skills](https://docs.github.com/en/copilot/concepts/agents/about-agent-skills) |

These project discovery paths were checked against official documentation on 23 October 2026. App versions, organization policy and session type can limit discovery. This bundle installs files for supported local/project contexts; it does not install those apps, sign in, change their approvals or establish every cloud/IDE variant. Ask the app to use the `polyspoon` skill after installation; restart/reload its project if needed.

## Local engine and outputs

Skill installation alone does not prepare generation. Bootstrap extracts the included verified source package into `.polyspoon/toolkit`, installs its pinned npm dependencies with lifecycle scripts disabled, and compiles through its existing portable runner. Network access may be needed for npm packages. It executes trusted local source and is not a sandbox.

The bundled source archive is the existing bench 1.1.0 source delivery revision 3, with its original notices and full reachable fourteen-recipe catalog. The runtime uses that catalog rather than pretending the skill contains an engine. It does not download private hosted models or grant publication permission. The included source is an explicit snapshot; its archive hash and source identity are recorded in `bundle.json` and the installed state.

Generation produces `asset.glb`, `asset.design.json` and `report.json` in a new directory. The report contains measured dimensions, geometry inspection and the GLB hash. Existing output directories reject. Save the complete validated design for repeat builds:

```sh
node .polyspoon/runtime.mjs build --config exports/bench-01/asset.design.json --out exports/bench-copy-01
```

The runtime retains validated migration metadata. Use the actual catalog controls and constraints. Source edits live in `.polyspoon/toolkit`; follow its `REBUILD.md` and `build.mjs` to recompile. Portable compilation does not replace repository typecheck, behavior tests, visual inspection or target-import verification. Geometry validity alone is not art-quality acceptance.

## Reinstall and update

Run the inspected archive's installer again with the same project and adapter. Unchanged files are idempotent. A newer bundle can replace previously managed files only when their current bytes match the prior installed hash. Conflicting user edits cause a preflight failure before managed files are written. User additions are retained. Review and merge conflicts explicitly; there is no force-overwrite option.

Installation does not overwrite an existing editable toolkit. Repeated bootstrap reuses a matching prepared toolkit. A different archive or an incomplete existing extraction is rejected with a preservation/migration instruction. Preserve the old toolkit and its edits before choosing a fresh project or explicitly migrating it. A changed engine is not silently installed over local source. The runtime also rejects a compiled toolkit whose archive marker does not match installed metadata. Bootstrap failures retain the extracted source for diagnosis; existing bootstrap export outputs must be preserved before retrying compilation.

## Maintainer packaging and verification

From a prepared checkout, the builder reuses the indexed, verified existing source archive without regenerating the catalog:

```sh
node --import tsx scripts/agent-bundle.ts --directory NEW_DIRECTORY --archive NEW_ARCHIVE.zip
node --import tsx --test tests/agent-install.test.ts tests/agent-site.test.ts
```

Choose new output paths for changed bundles. The builder refuses existing archive/directory paths. A release needs matching inspected scripts and archive; do not silently replace a released ZIP at its old URL.

The bounded checks install and update each adapter in temporary projects, retain user edits, reject unsupported targets/symlink escapes, install from the actual archive, bootstrap the pinned engine and export a valid changed-width bench. A separate actual local `/docs` test checks all app setup requests, clipboard copy, the served ZIP and mobile field visibility. These checks exercise installer/runtime scripts and web UI, not live Codex, Claude Code, Cursor or Copilot app sessions. Runtime execution was checked on Linux with Node 22.22.1; other operating systems and native compiler packages remain unverified.
