# Contributing to Celadon Lowpoly

There are two ways to make a model, with different rules.

**Local creation.** Point your coding agent at this checkout and ask for an asset. The agent builds, validates, reviews renders, repairs and delivers it. Nobody else has to approve it.

**Public contribution.** Anything published to the hosted catalog needs independent human review by someone other than the author, every time. Start from a preset of an existing reviewed recipe where you can. Submit the parameter JSON, its exact recipe version, provenance, intended license, neutral previews and a short note on what changed. Follow [contribution review](docs/contributing/review.md). Votes, points and levels never stand in for review.

New recipes are executable code, so they also need maintainer code review before they run on the service. Locally, review sources and dependencies yourself and run untrusted code in isolation. Read the [authoring guide](docs/authoring/guide.md), give your agent the [coding-agent brief](docs/authoring/coding-agent.md), and use the [bench example](examples/recipes/bench/index.ts) as a model. Any coding assistant or plain editor works; the toolkit needs no provider account or API key.

## Improve the engine

Every recipe builds on the shared generator in [src/engine](src/engine). A better roof, timber joint or stone shape improves every model that uses it. To change it:

```sh
git clone https://github.com/Dt51-51/celadon-lowpoly.git && cd celadon-lowpoly
npm ci --ignore-scripts --no-audit --no-fund
npx playwright-core install chromium      # once, for renders
npm run dev                               # live preview at http://127.0.0.1:4173
npm run recipe:render -- --family cottage --out renders/before
```

Edit a file in `src/engine`, watch the preview update, then render the same recipe again and run the checks:

```sh
npm run recipe:render -- --family cottage --out renders/after
npm run typecheck && npm test
```

Open a pull request on GitHub with the change, and attach the matching before and after images from `renders/`. Render every recipe your change touches. Keep `renders/` out of the commit.

## Checks

Use Node.js 22.22.1 from a clean checkout of this directory:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm ci --prefix server --ignore-scripts --no-audit --no-fund   # hosted-service types (wrangler, workers-types)
npm run typecheck
npm test
npm run validate -- --family bench --out evidence/bench
node_modules/.bin/vite build
```

Also run the checks in [docs/release.md](docs/release.md). A passing typecheck is not visual approval.

## Source packages

Build them with `npm run recipe:package --`. Find the family and version path in `public/recipe-packages/index.json`, then inspect it with `npm run recipe:check -- public/recipe-packages/FAMILY-VERSION-source.2.zip`. Recipe version and delivery revision are separate numbers. New packages use manifest format 2 and delivery revision 2; format 1 archives stay immutable. Read the [source package contract](docs/authoring/source-package-contract.md) before running code from a package.

## Honest claims

State the source revision, recipe version, presets and parameter cases you tested and reviewed. Quality claims cover only those cases, not every slider combination. Record real technical and visual findings and open problems. Never fabricate a review or imply a human approval that didn't happen.

## Licensing

Read [license scope](docs/licensing.md) first. Don't submit material you can't license, credentials, research screenshots, Unity templates or third-party assets without permission and notices. Contributing doesn't relicense third-party work.
