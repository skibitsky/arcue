# Core audit fixes

Implemented A01, A02, A03, A04 and A09 from the 9 October audit. Each issue started with a failing behavior regression, followed by the implementation and a passing focused run. Tests use core commands and the existing memory filesystem/import-worker boundaries. No branch or commit was created.

| Issue | Observed RED | Change | Focused GREEN |
|---|---|---|---|
| A01: round copy during relocation | Copied prompt pointed to `Hero.fbx/rounds/round-1` after the model moved to `Striker.fbx`. | Round copying joins the asset's composition-edit line, so location and round snapshots are taken after relocation. Existing lock order is preserved. | 41 relink/round tests passed. |
| A02: review confinement | Comment creation succeeded through replaced repository/app-data review roots; screenshot reads returned redirected PNG bytes; outside-repository open and review move accepted a linked root. | One stable-root path check is used for session reads/saves, opening, prepared screenshot/round/composition writes, rollback, screenshot reads, relocation and cleanup. Workspace/app-data roots remain trusted; links below them are refused. | 74 move/robustness/relink tests passed; subsequent rollback regression and robustness run passed 27 tests. |
| A03: member relink and undo | Undo returned `changed: true` after member relinking and restored an obsolete clip identifier. | Successful automatic member relabeling clears undo/redo history atomically with its save, matching whole-model relocation. | 40 relink/history tests passed. |
| A04: external image dependencies | Explicit Reload retained bytes `[1]` after replacement by `[2]`. Automatic creation of initially missing direct/search-resolved images left the scene empty. | Import-time read/find/locate requests record dependency identity and candidate paths. Reload rechecks them, reparses only invalidated imports, watches external images, and computes a new asset version when dependencies change. | 87 asset/composition/import/search tests passed. |
| A09: abbreviated identity collision | Distinct fixtures sharing prefix `f8ac5e7` retained old width `3.287` instead of `6.4265`. | New file/cache/version identities retain all 16 hash digits. Prompt display remains abbreviated. Existing short identifiers, original comment-version references and immutable rounds remain readable and retained. | 61 asset/identity/round/relink tests passed; legacy compatibility suite passed 5 tests. |

Additional A04 RED→GREEN slices cover relocation (a moved model initially reused the old folder's image) and dependency read failures (the command rejected while the asset incorrectly remained ready). Dependencies now replay against the current asset folder/read root; failures preserve the last scene and mark the reload failed. Their focused run passed 96 tests.

The A02 rollback regression replaces the root while a save is prepared. Before the fix, rejecting the save still invoked cleanup through the redirected path and deleted an external sentinel. Rollback now checks confinement before touching files. Prepared writes and cleanup also validate their own paths, including deeper screenshot/round directories.

Final verification: all 371 core tests across 29 files passed; `pnpm --filter @arcue/core typecheck` passed; scoped Biome checks passed. The coordinating agent runs whole-repository and browser/Electron checks after integration.

Remaining boundaries:

- Filesystem confinement is checked before operations. It rejects persistent link replacement, including during preparation/rollback, but does not claim OS-level race resistance against a precisely timed concurrent filesystem attacker.
- Existing Platform watchers subscribe to exact paths. Creating a previously missing image with different filename/directory casing can require explicit Reload; Reload uses the case-insensitive resolver. This change does not expand the host watcher contract.
- The full content hash remains the existing noncryptographic 64-bit file identity. This fix removes the demonstrated 28-bit truncation collision; it does not turn content matching into a security checksum.
