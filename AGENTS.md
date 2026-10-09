# Arcue

Arcue is a desktop app for reviewing 3D models and animations and handing anchored feedback to AI coding agents. You pin or paint on the model at a frame, write a line, and Arcue copies a prompt with the vertices, bones, frame, camera and screenshots. It is an Electron app in TypeScript; a web host runs the same UI, 3D view and core in a browser.

A local `docs/` folder, kept out of git, may hold `spec.md` for behavior, `architecture.md` for processes, packages and contracts, `design.md` for the UI, and `research/`. Read them when they exist.

## Commands

| Command | Does |
|---|---|
| `pnpm install` | Installs everything. Node 22.12 or later; pnpm comes from `packageManager`. |
| `pnpm dev` | Starts the web host at http://localhost:5173. |
| `pnpm typecheck` | Type-checks every package and app. |
| `pnpm lint` | Biome lint and format check. `pnpm format` fixes what it can. |
| `pnpm test` | Runs every test. `pnpm test --project @arcue/core` runs one package. |
| `pnpm --filter @arcue/web test:e2e` | Builds the web host and runs its Playwright tests. Run `pnpm --filter @arcue/web exec playwright install chromium` once first. |
| `pnpm --filter @arcue/cli build` | Builds the `arcue` command into `apps/cli/dist/arcue.js`. |
| `pnpm --filter @arcue/desktop dev` | Runs the desktop app with its windows on a Vite dev server. |
| `pnpm --filter @arcue/desktop test:e2e` | Builds the desktop app and the `arcue` command, then drives the built app with Playwright. |

## Packages

| Package | Owns |
|---|---|
| `packages/scene` | The format-independent scene description, anchors, ranges, topology fingerprint, closest-point queries, `Importer`. |
| `packages/protocol` | zod schemas for commands, queries, events, `review.json` and `round.json`; `CoreClient`; the transport. |
| `packages/import-fbx` | The FBX importer on ufbx compiled to WebAssembly, and the import worker's entry. |
| `packages/core` | `Platform`, the command registry, and all review state. |
| `packages/platform-node` | `NodePlatform` on Node's file system, and the worker_threads import worker for Node hosts. |
| `packages/viewport` | The 3D view: three.js rendering, tools, picking, screenshots. |
| `packages/ui` | Design tokens and fonts, and the panels, timeline and comment box. |
| `apps/web`, `apps/desktop`, `apps/cli` | The browser host, the Electron app, the `arcue` command. |

## Rules

- Dependencies point one way: apps import packages, never the reverse. Only `core` reads or writes files, and only through `Platform`. `viewport` and `ui` never import `core`; they use `CoreClient`.
- The schemas in `packages/protocol` are the contract. Change a command, file format or event there first, and keep `docs/architecture.md` in step when it exists.
- Clips are identified by their name in the file, such as "Armature|Charge", made unique by `clipNames`; display names are only for people.
- Every package exports its public surface from `src/index.ts`. Do not import another package's internal files.
- Logic gets Vitest tests next to the code, as `*.test.ts`.
- No code comments unless they are essential for understanding how to use the code. Prefer clear names.
- No `any`. TypeScript is strict, with `noUncheckedIndexedAccess`.
- Colors have functions, and each function owns its color: feedback is blue, resolved comments a very dim blue, the playhead a thin red line, warnings and errors amber, everything else warm charcoal neutrals. Use the tokens in `packages/ui/src/tokens.css`, never raw colors.
- Verify UI changes in the web host in a browser before calling them done. `?sample=pebble-golem&clip=Armature%7CWalk&frame=12` opens a sample at a clip and frame; `window.arcue.client` runs any command or query, and `window.arcue.store` holds the window's state.
- Commit messages end with this line:

  ```text
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  ```
