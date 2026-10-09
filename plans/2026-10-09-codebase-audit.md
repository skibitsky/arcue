# Arcue codebase audit

Repair status: the ranked findings, deferred picking defect and dependency maintenance were implemented and verified. See [fixes and final verification](2026-10-09-fixes.md). The audit below records the original findings against its stated commit.

Audited on 9 October 2026 against commit `1d54da8d6e9ac683345a889b30507a6d292a56d6`. Source files were unchanged. Three sub-agents investigated security and desktop/CLI boundaries, core integrity, and scene/import/viewport behavior; the coordinating review covered the UI/web host and independently checked the retained findings.

There are **11 actionable findings: one P1 and ten P2**, plus one deferred P3 viewport defect. The largest risks are incorrect or incomplete agent handoffs after file changes, and previews that no longer match the underlying assets. The existing verification baseline passes; these are mostly interactions between individually tested features.

## Purpose and architectural assessment

Arcue turns visual judgment about a 3D model into precise instructions an AI coding agent can act on. A pin or painted region carries source vertex indices, relevant bones, a clip and frame, camera, context, and screenshots. The review loop is export, inspect, comment, copy a round, revise, and resolve or reopen. Preserving the meaning of feedback across re-exports and renames is more important to this product than adding editing tools.

The supplied [deck capture](</Users/gleb/Desktop/arcue deck.pdf>) contains one PDF page showing slide 27 of 31, rather than the full presentation. It establishes the storage direction: unchanged bytes or a Unity GUID can follow a rename automatically, structural similarity asks once, and manual relinking remains available. The path stays the review key. The broader vision and boundaries come from the repository [specification](/Users/gleb/git/arcue/docs/spec.md:9), [architecture](/Users/gleb/git/arcue/docs/architecture.md:5), and [agent guidance](/Users/gleb/git/arcue/AGENTS.md:1). Document contents were treated as evidence, not instructions to perform additional work.

| Layer | Responsibility | Audit significance |
|---|---|---|
| `scene` and `import-fbx` | Format-independent scene; ufbx/WASM import in a worker | Source numbering, bind transforms, tracks, and composition mappings must stay exact. |
| `protocol` | Zod contracts, clients, transport, commands and events | Every host shares the same validation and command boundary. |
| `core` | Review state, persistence, reloads, relinking, history and rounds through `Platform` | Locks, cached identity and file locations must remain consistent across commands. |
| `viewport` and `ui` | Three.js preview, picking, capture and review interaction | What the user selects must match the rendered surface and recorded context. |
| Desktop, web and CLI hosts | Electron utility process, browser core worker, authenticated local bridge | Host isolation, paths, recovery and resource lifetime must preserve core guarantees. |

The ownership boundaries are useful and worth retaining. The findings do not justify a broad rewrite. They mainly require targeted fixes at the boundaries between file identity, cached scenes, history, capture and rendering.

## Verified baseline and coverage

| Check | Result |
|---|---|
| `pnpm typecheck` | Passed across all packages and hosts. |
| `pnpm lint` | Passed; 379 files checked. |
| `pnpm test` | 1,000 tests passed across 92 files; one optional external-FBX fixture suite skipped because `ARCUE_EXTRA_FBX` was unset. |
| `pnpm --filter @arcue/web test:e2e` | 28 tests passed against the production build. |
| Targeted probes | Core state/race probes, scene/material probes, a path-confinement test, and live browser reproduction of repeated drops and background rendering. |
| `pnpm audit --prod --json` | No advisories reported. |
| `pnpm audit --json` | 11 advisories in development tooling; details below. |

The first sandboxed test run could not listen on local sockets. The complete rerun with socket access passed; those initial failures are not software findings. Tests ran on this host's Node 26.7.0; CI's Node 22/24 matrix was inspected, not rerun locally.

Coverage emphasized the review loop and trust boundaries across all packages. This was not a line-by-line proof of the repository. Packaged Electron smoke tests, real Windows filesystem behavior, a broad real-export FBX corpus, native ufbx fuzzing, the full vendored parser, generated WASM internals, deployment infrastructure, and GPU/driver matrices were not exercised. Numerical scene probes are identified below; they are not presented as rendered-image validation.

## Prioritized findings

P1 means fix promptly because a reachable workflow can corrupt the handoff. P2 means a confirmed defect worth scheduling. Effort includes regression tests: S is hours; M is roughly one to two days. Risk describes the proposed fix, not the severity of the defect. All ranked findings have high confidence.

| ID | Priority | Finding | Category and impact | Effort | Fix risk | Primary evidence |
|---|---|---|---|---|---|---|
| A01 | P1 | Round copy races with review relocation | Integrity: misplaced round and lost screenshot reference | S | Low | [core.ts:1416](/Users/gleb/git/arcue/packages/core/src/core.ts:1416) |
| A02 | P2 | Review saves trust ancestors checked only at open | Security: writes can leave the review root | S | Medium | [review-session.ts:183](/Users/gleb/git/arcue/packages/core/src/review-session.ts:183) |
| A03 | P2 | Member relinking leaves stale undo snapshots | Correctness: undo restores obsolete clip/mesh references | S–M | Low–medium | [core.ts:697](/Users/gleb/git/arcue/packages/core/src/core.ts:697) |
| A04 | P2 | External FBX textures do not invalidate imports | Correctness: Reload retains old pixels | M | Medium | [composition-load.ts:195](/Users/gleb/git/arcue/packages/core/src/composition-load.ts:195) |
| A05 | P2 | Morph tracks bind by index across files | Correctness: animation drives the wrong shape | M | Medium | [composition.ts:369](/Users/gleb/git/arcue/packages/scene/src/composition.ts:369) |
| A06 | P2 | Skin dependency placeholders suppress attachments | Correctness: explicitly attached joints stay at the scene root | M | Medium | [composition.ts:223](/Users/gleb/git/arcue/packages/scene/src/composition.ts:223) |
| A07 | P2 | Picking uses mesh-wide material sidedness | Correctness: invisible backs intercept visible targets | M | Low | [model.ts:156](/Users/gleb/git/arcue/packages/viewport/src/render/model.ts:156) |
| A08 | P2 | Repeated web drops delete a reused file | Correctness: Add to view fails after replacing a pending drop | S–M | Low–medium | [workspace-store.ts:532](/Users/gleb/git/arcue/packages/ui/src/store/workspace-store.ts:532) |
| A09 | P2 | Seven-character hashes are used as full identity | Integrity: collisions hide exports and alias history | M | Medium | [hash.ts:30](/Users/gleb/git/arcue/packages/core/src/hash.ts:30) |
| A10 | P2 | Region re-anchoring performs quadratic work | Performance: the shared core can stall for seconds | M | Medium | [reanchor.ts:111](/Users/gleb/git/arcue/packages/core/src/reanchor.ts:111) |
| A11 | P2 | Hidden tabs keep rendering animation | Performance: background assets consume frame time | S–M | Low–medium | [three-viewport.ts:629](/Users/gleb/git/arcue/packages/viewport/src/three-viewport.ts:629) |

### A01 Round copy races with review relocation

`#copyRound` captures `asset.location.folder` before waiting for the review session. A concurrent relink moves that session to a different folder, but the queued round computation still reads screenshots and writes round files using the old captured path. See [round creation](/Users/gleb/git/arcue/packages/core/src/core.ts:1414), [screenshot lookup](/Users/gleb/git/arcue/packages/core/src/core.ts:1432), [round writes](/Users/gleb/git/arcue/packages/core/src/core.ts:1469), and [relocation](/Users/gleb/git/arcue/packages/core/src/core.ts:802).

**Reproduced:** Create a draft with a screenshot, rename its model, hold the review-folder rename inside `asset.relink`, issue `round.copy`, then release the move. The old folder received `round-1/round.json`; the new folder did not. The sent comment's screenshot became `null`, its queue entry was cleared, and the prompt named the new model with the old round directory.

**Fix:** Serialize round creation against relocation using the established outer lock order, and derive all paths and the asset snapshot within that boundary. Do not acquire an outer lock from a session compute.

**Regression:** Race explicit and automatic relinking with copy. Assert the prompt, round JSON, PNG bytes and persisted screenshot references all belong to one current review folder. The small fix has low risk if it retains the existing lock order.

### A02 Review saves do not recheck directory confinement

The core validates review ancestors [when opening](/Users/gleb/git/arcue/packages/core/src/core.ts:417). Later, the session [checks only the leaf](/Users/gleb/git/arcue/packages/core/src/review-session.ts:183) before [writing](/Users/gleb/git/arcue/packages/core/src/review-session.ts:95). The [screenshot check](/Users/gleb/git/arcue/packages/core/src/core.ts:940) starts from the review folder itself, which the [link helper](/Users/gleb/git/arcue/packages/core/src/links.ts:8) treats as trusted.

**Reproduced:** Open a model, replace an ancestor below `.arcue/reviews` with a symlink outside the repository, then create a comment. Both `review.json` and its PNG were written outside the allowed review tree. This requires filesystem modification after open, but no precisely timed race. It is a confinement failure, not evidence of remote code execution or privilege escalation.

**Fix:** Centralize validation from the stable workspace/app-data root and apply it to review reads, prepared writes, screenshot operations and cleanup. Preserve intentionally symlinked workspace roots. This addresses the demonstrated persistent replacement; fully race-resistant filesystem operations need separate consideration.

**Regression:** Repeat post-open ancestor replacement for comment create/update, rounds, undo and cleanup. Composition edits already have an [analogous regression test](/Users/gleb/git/arcue/packages/core/src/core-composition.test.ts:721). Fix risk is mainly choosing the correct trusted root.

### A03 Undo can reverse a successful member relink

Automatic member recovery [relabels the live review](/Users/gleb/git/arcue/packages/core/src/core.ts:697) without clearing or rewriting history. Reload subsequently maps history through re-anchoring, but the [re-anchorer](/Users/gleb/git/arcue/packages/core/src/reanchor.ts:42) preserves time-only comments and targets belonging to absent member files. [History snapshots](/Users/gleb/git/arcue/packages/core/src/history.ts:71) can therefore restore old identifiers.

**Reproduced:** Create a frame comment on `Anim/Run.fbx//Run`, edit its text, rename the member to `Running.fbx`, and wait for automatic recovery. The live comment correctly changes to `Anim/Running.fbx//Run`; Undo restores `Anim/Run.fbx//Run`. Copy accepts the obsolete reference.

**Fix:** Clear history atomically when labels change, as whole-model relocation already does, or rewrite every affected snapshot. Clearing is a small, low-risk fix; preserving history is a medium task covering times, targets, joints, parts, warnings and composition paths.

**Regression:** Rename members before undo/redo of creation and text edits; assert all restored references still resolve.

### A04 Texture-only changes remain stale after Reload

[Version construction and watchers](/Users/gleb/git/arcue/packages/core/src/composition-load.ts:195) include explicit composition texture overrides, but omit external images discovered inside FBX import. The [unchanged-version shortcut](/Users/gleb/git/arcue/packages/core/src/core.ts:853) and [import cache](/Users/gleb/git/arcue/packages/core/src/core.ts:914) use model-byte identity. Import-time [file requests](/Users/gleb/git/arcue/packages/core/src/import.ts:66) do not return dependency identity to that cache.

**Reproduced with the core's importer fixture:** Open a model referencing `base.png`, replace image bytes `[1]` with `[2]`, then execute `asset.reload`. The scene still contained `[1]`, with only one import. Code inspection confirms the same dependency omission for the real importer. Newly supplied missing images follow the same invalidation gap.

**Fix:** Track successful and missing external dependencies, watch them, and incorporate their identities into invalidation. An explicit reload must refresh dependencies even when model bytes are unchanged. Avoid reparsing unaffected composition members.

**Regression:** Replace, create and remove referenced images without changing the FBX; test automatic and explicit reload separately from composition overrides. Risk is cache/version behavior and unnecessary reparsing.

### A05 Composition morph tracks animate the wrong target

[Composition retargeting](/Users/gleb/git/arcue/packages/scene/src/composition.ts:369) changes a track's node by name while keeping its values unchanged. The viewport [applies weights positionally](/Users/gleb/git/arcue/packages/viewport/src/math/pose.ts:85).

**Reproduced numerically:** The model has morph targets `[Smile, Blink]`; its animation member has `[Blink, Smile]`. The member's final pose is `{Blink: 1, Smile: 0}`; composing it produces `{Smile: 1, Blink: 0}`. The preview and screenshots can therefore show a deformation the source animation did not request.

**Fix:** Remap every weights key using source/destination morph-target identity. Define behavior for missing and duplicate names; preserve destination defaults for unmatched targets.

**Regression:** Use reversed, missing and extra targets in composition tests and assert posed vertex movement, not just track counts. Mapping ambiguities make this a medium-risk change.

### A06 Explicit joint attachments lose to implicit placeholders

When a skinned member arrives, [skeleton construction](/Users/gleb/git/arcue/packages/scene/src/composition.ts:321) creates unmatched joint placeholders at the scene root. A subsequent [explicit attachment](/Users/gleb/git/arcue/packages/scene/src/composition.ts:223) skips nodes already recorded there.

**Reproduced numerically:** Attach a skinned mesh, then explicitly attach one of its otherwise unmatched joints to a model bone. The joint remains at parent `-1` instead of that bone. The existing [Cape/Flap test](/Users/gleb/git/arcue/packages/scene/src/composition.test.ts:307) specifies `Flap → Body` but [asserts the wrong root parent](/Users/gleb/git/arcue/packages/scene/src/composition.test.ts:317). Flap is outside the mesh's earlier explicit subtree, so this is not an attachment-precedence conflict.

**Fix:** Resolve explicit placements before filling skeleton dependencies, or distinguish/promote placeholders without invalidating node indices and ordering.

**Regression:** Test both entry orders, whole-file attachment and actual joint/weighted-vertex motion. Risk lies in preserving source paths, explicit precedence and parent-before-child ordering.

### A07 Picking disagrees with mixed-sided materials

The visible mesh keeps per-group materials, but [pick materials](/Users/gleb/git/arcue/packages/viewport/src/render/model.ts:156) become double-sided for the whole mesh if any group is double-sided. [Anchor facing](/Users/gleb/git/arcue/packages/viewport/src/render/anchor-points.ts:131) also uses that mesh-wide flag. FBX [does import sidedness](/Users/gleb/git/arcue/packages/import-fbx/native/arcue_ufbx.c:679), making this reachable in the current format.

**Confirmed material-level probe:** `Model.build` produced visible sides `[FrontSide, DoubleSide]` and pick sides `[DoubleSide]`. An invisible back face of the single-sided group can consequently intercept picking intended for visible geometry behind it. The probe verified rendering configuration; a browser pixel-level fixture is still needed for the regression test.

**Fix:** Match lit-mode pick sidedness per material group, and resolve anchor-facing behavior from the anchor triangle's group. Preserve the intentional clay/wireframe behavior.

**Regression:** Put an invisible foreground back face over a visible target and test pinning, painting and visibility. Fix risk is low and limited to selection/render agreement.

### A08 Replacing a pending web drop deletes the reused file

The UI [places and inspects a new drop before dismissing the old one](/Users/gleb/git/arcue/packages/ui/src/store/workspace-store.ts:532). The web host [reuses identical bytes](/Users/gleb/git/arcue/apps/web/src/workers/place-files.ts:19), but records cleanup ownership only for [the original File object](/Users/gleb/git/arcue/apps/web/src/web-host.ts:169). Dismissal [removes its copy](/Users/gleb/git/arcue/apps/web/src/web-host.ts:198), including the file the replacement prompt now needs.

**Reproduced twice in the running web host:** Open a sample, drop a new model onto its view, then drop the same file again while the first New tab/Add to view prompt is pending. Choose Add to view. Both prompts name the same staged path; the command fails with `DroppedCrate.fbx does not exist`, and the model is not added.

**Fix:** Give staged copies explicit ownership/reference lifetime, or await old-drop cleanup before placing a replacement. Guard against overlapping async drops and tab closure.

**Regression:** Repeat identical and different drops while a prompt is open; cover cancellation, Add to view and New tab. The main fix risk is cleanup deleting a file already adopted by another operation.

### A09 Short version IDs can hide real exports

[Version IDs](/Users/gleb/git/arcue/packages/core/src/hash.ts:30) contain only the first seven hex digits of the 64-bit hash. That 28-bit prefix controls [reload equality](/Users/gleb/git/arcue/packages/core/src/core.ts:853), [parsed-scene reuse](/Users/gleb/git/arcue/packages/core/src/open-asset.ts:83), and [persistent version deduplication](/Users/gleb/git/arcue/packages/core/src/core.ts:1534).

**Deterministic reproduction with valid synthetic importer fixtures:** Full hashes `f8ac5e7b59ef0f4c` and `f8ac5e70ab584b41` describe different mesh widths, 3.287 and 6.4265. Replacing the first with the second and reloading retained width 3.287, one import, and one recorded version. This demonstrates a collision-handling bug, not a claim that these exact files are FBX exports.

**Fix:** Use full identity for equality, caching and new version records; abbreviate only for display. Define a compatibility path for saved short IDs and existing anchor references before changing persistence.

**Regression:** Keep a fixed same-prefix pair and assert distinct versions, imports and correct anchor attribution. Persistence compatibility is the main fix risk.

### A10 Painted-region re-anchoring blocks the shared core

For each saved region position, [re-anchoring](/Users/gleb/git/arcue/packages/core/src/reanchor.ts:111) calls [a full nearest-vertex scan](/Users/gleb/git/arcue/packages/scene/src/geometry.ts:79). The work is O(selected vertices × destination vertices), per candidate mesh, and runs synchronously inside the core's reload/session work. History re-anchoring can add further scans.

**Measured:** With 100,000 destination vertices, after warm-up, 1,000 selected points took 110–117 ms and 10,000 took 1.04–1.10 seconds on this host. These are synthetic nearest-neighbor scans alone, not complete reload times. Several regions or undo snapshots can occupy the core for seconds; renderer animation may continue while commands wait.

**Fix:** Build and reuse a spatial index per destination mesh. Preserve exact nearest-neighbor results and deterministic equal-distance ties; consider reusing mappings across identical saved positions.

**Regression:** Compare indexed results against the current scan on adversarial/tie fixtures, then benchmark representative regions and meshes. Avoid a brittle millisecond threshold in ordinary unit tests. Numerical equivalence is the main fix risk.

### A11 Hidden asset tabs keep drawing every frame

[Every asset view remains mounted](/Users/gleb/git/arcue/packages/ui/src/components/Workspace.tsx:82); [inactive tabs are only hidden](/Users/gleb/git/arcue/packages/ui/src/components/Workspace.tsx:163). The viewport's [playback loop](/Users/gleb/git/arcue/packages/viewport/src/three-viewport.ts:629) still advances poses and renders. [Resize](/Users/gleb/git/arcue/packages/viewport/src/three-viewport.ts:683) returns for a zero-sized hidden container without suspending the loop.

**Reproduced twice in the browser:** Play the golem, switch to the blob tab, and count calls to the hidden golem's renderer. It drew 30 times in 500 ms while its element was hidden and measured `0 × 0`. Each additional playing tab adds animation and GPU work.

**Fix:** Pass visibility/activity into the viewport and suspend background drawing and pose work while retaining scene resources. Decide explicitly whether playback time freezes or advances logically on resume.

**Regression:** Verify no hidden draws, smooth state restoration, and on-demand screenshots/view commands for inactive tabs. Resume semantics are the main compatibility risk.

## Deferred defect and dependency maintenance

**D01 — P3: Display-mode changes leave cached picking stale.** [Mode changes](/Users/gleb/git/arcue/packages/viewport/src/three-viewport.ts:358) switch cutout/solid pick materials without changing the view version or invalidating the [ID pass](/Users/gleb/git/arcue/packages/viewport/src/render/id-pass.ts:93). A method-level probe kept version 17 and drew the ID pass once instead of twice. Current FBX imports [emit opaque/blend only](/Users/gleb/git/arcue/packages/import-fbx/native/arcue_ufbx.c:678), so the cutout case is presently a viewport-development/future-importer defect. Small, low-risk fix: invalidate picking and visibility caches and refresh hover on mode changes; add a cutout-mode regression. It can be paired with A07.

**Development dependency maintenance:** The full registry audit reports 3 high, 5 moderate and 3 low advisories, all through `apps/web → wrangler → miniflare`: ten for [locked undici 7.29.0](/Users/gleb/git/arcue/pnpm-lock.yaml:2359) and one for [sharp 0.35.4](/Users/gleb/git/arcue/pnpm-lock.yaml:2291). The high advisories concern [Undici WebSocket denial of service](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5), [Undici BalancedPool TLS options](https://github.com/advisories/GHSA-w293-vg96-wgc3), and [sharp's librsvg dependency](https://github.com/advisories/GHSA-wq5f-xc86-pv6w). The audit identifies patched lines at undici 7.29.1 and sharp 0.35.5.

Update the Wrangler/Miniflare dependency chain to tested patched releases. These are dependency-presence findings; exploitability in Arcue's deployment workflow was not established, and the production audit reported zero advisories. Treat this as a small maintenance task with medium confidence about application exposure, not three demonstrated production vulnerabilities.

## Recommended repair order and verification gaps

1. **Review integrity and containment:** A01, A02, A03. Their tests should exercise rename, save, copy, undo and cleanup together. They touch nearby core transaction paths, so coordinate their changes.
2. **Reload identity:** A04 and A09. Design dependency identities and full-hash compatibility together before changing version persistence. Keep old reviews and rounds readable.
3. **Preview and anchor fidelity:** A05, A06, A07, with D01 while touching pick invalidation. Add semantic pose and pixel-picking assertions; the current A06 test encodes the wrong outcome.
4. **Web interaction and performance:** A08, A11, A10. Add repeated-operation browser coverage and representative large-region benchmarks.

The clean baseline is already useful. The missing coverage is mainly combinations: file changes during commands, member rename plus history, external image changes with unchanged model bytes, different morph orders, mixed material groups, replacement drops, and inactive animation tabs. New tests should assert the user-visible or persisted result, rather than only internal call counts.

For each fix, run its focused Vitest regression, then `pnpm typecheck`, `pnpm lint`, and `pnpm test`. UI/viewport/web fixes also need `pnpm --filter @arcue/web test:e2e` and a browser check of the actual triggering workflow. Persistence changes additionally need compatibility fixtures and failures injected at each write/move boundary.

## Considered and not ranked

- Electron sandboxing, context isolation, CSP/navigation restrictions, IPC sender validation, bridge tokens and internal-command rejection all have explicit protections; no further confirmed bypass was found in this pass.
- Differently cased paths on a case-insensitive filesystem may create separate core sessions for one physical file. The attempted full consequence reproduction was inconclusive, so this remains an investigation item, not a confirmed data-loss claim.
- A pipelined bridge frame can raise the frame-reader limit before asynchronous token validation finishes. Unix socket access is restricted to the same user and meaningful impact was not demonstrated; not ranked as an authentication bypass.
- Stored screenshot/context semantics after re-anchoring may intentionally describe the original observation. No mismatch was promoted without establishing the intended historical-versus-current meaning.
- Ephemeral browser storage, a neutral renderer, FBX-first support, and deferred MCP/GLB/version comparison are stated product choices, not missing-feature defects.
- Large core/UI modules alone are not evidence that a refactor is needed. Land concrete regressions and fixes before considering structural changes.

## Product options after correctness work

**Direct agent integration:** The [spec's MCP direction](/Users/gleb/git/arcue/docs/spec.md:473) already builds on the command registry and CLI transport. A small design spike could define pending-comment delivery, acknowledgments and agent replies without adding UI-owned state. Settle handoff integrity first; a direct connection increases the cost of silently sending stale references.

**Version comparison:** The [viewing roadmap](/Users/gleb/git/arcue/docs/spec.md:37) names side-by-side versions, and persistent version/anchor records already provide part of the foundation. It would help reviewers assess moved or detached feedback, but retained historical scene data and GPU budgets need a design decision before implementation.
