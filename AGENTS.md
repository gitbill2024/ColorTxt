# AGENTS.md — ColorTxt

## Quick start

```bash
npm install         # postinstall runs electron-rebuild + patches
npm run dev         # electron-vite dev
npm run typecheck   # vue-tsc --noEmit (only type check available)
```

## No lint / no tests

- `npm run lint` is a placeholder echo only.
- **No test framework exists** in this repo. Do not try to run tests.
- All verification is manual or via `npm run typecheck`.

## Architecture

- **Electron + Vue 3 + Monaco Editor**, built with `electron-vite`.
- Three entrypoints configured in `electron.vite.config.ts`:
  - `src/main/index.ts` — main process (ESM, bundled by rollup)
  - `src/preload/index.ts` — preload (CJS, exposes `window.colorTxt` via `contextBridge`)
  - `src/renderer/` — Vue app + Monaco reader
- `vite.config.ts` is a **placeholder for editor tooling only**; the real config is `electron.vite.config.ts`.
- Shared code lives in `src/shared/` (aliased as `@shared/`).

## Build pipeline

```
electron-vite build
  → electron-rebuild -f -w better-sqlite3,opencc
  → node scripts/prune-pack-deps.mjs
  → electron-builder
```

- After pruning, restore with `npm ci`.
- `asarUnpack` includes: `better-sqlite3`, `sqlite-vec*`, `onnxruntime-node/bin`, `@node-rs/jieba*`, `opencc`.

## CSP

Set in `src/renderer/index.html`. Allows `unsafe-eval` (needed for text replace `@js:`), inline styles, external images/media, and localhost WS. Do not weaken further.

## CI release

GitHub Actions on `v*` tags. Tag must match `v{package.json.version}`. Multi-arch parallel builds (5 jobs) merged into one GitHub Release. Run `npm version patch|minor|major` to bump and tag.

## Notable quirks

- Node.js 22.22.2 required (`.node-version`).
- `opencc` is external in rollup and loaded at runtime via `createRequire` — do NOT bundle it.
- `scripts/prune-pack-deps.mjs` modifies `node_modules` in-place before electron-builder. Supports `--platform` / `--arch` for cross-compilation.
- `scripts/patch-*.mjs` run in `postinstall` and must not be skipped.
