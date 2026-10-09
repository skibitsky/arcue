# Viewport audit repairs

Scope: A07, A11 and D01 from the 9 October 2026 codebase audit. Changes were made on the active branch without creating a worktree or committing. Each independent behavior below was reproduced with a failing regression before its implementation changed.

## A07: material-group picking and pin visibility

The lit ID pass now preserves each material group's sidedness and alpha cutout. Clay and wireframe retain their existing mesh-wide solid-material behavior. Pin facing reads the triangle's current display material instead of a mesh-wide double-sided flag.

| Cycle | RED evidence | GREEN evidence |
|---|---|---|
| Raycast from behind a single-sided group in a mesh that also has a double-sided group | `model.test.ts` expected no intersection but received one. | All four model tests pass, including retained back-face picking on double-sided groups and in clay mode. |
| Pin visibility on that single-sided group's back face | `facesCamera` returned true instead of false through the resolved public anchor. | Lit mode hides that pin; clay mode restores it. |

The browser regression builds a procedural scene in the existing web viewport, with an invisible foreground back face over a visible rear triangle. Real mouse pinning and painting both target `Behind`, and the foreground anchor is not visible. No sample files were changed.

## D01: display-mode picking cache

Display-mode changes now advance the view version, invalidate ID pixels and cached surface visibility, and refresh hover.

RED: in the browser, a rear surface remained visible after switching an alpha-cutout foreground from lit to solid clay without moving the camera or pose (`clay: true`, expected `false`). GREEN: the same public `screenPosition` calls produce `{ lit: true, clay: false, litAgain: true }`.

## A11: inactive asset views

The common viewport contract has `setActive`. Workspace propagates the active tab through Stage and its viewport host. Inactive views retain resources and their playing state, freeze the playback clock, cancel the frame loop, and suppress automatic hover and pin-visibility work. Reactivation restores sizing and starts drawing again with a fresh playback delta. Explicit camera/framing changes apply immediately while inactive; explicit screenshot and query operations remain available.

The desktop host's existing pause-on-tab-switch behavior is unchanged. The common viewport lifecycle adds rendering suspension; the web host resumes its retained playing state.

RED: after switching from a playing golem to the blob, actual WebGL draw calls increased from 128 to 261 and the golem clock advanced from 0.300 to 0.617 seconds during 300 ms while hidden. The regression instruments only the WebGL system boundary and reads public session state.

GREEN: hidden time and draw count remain unchanged, `playing` remains true, an explicit hidden screenshot decodes to the requested dimensions, no loop starts after capture, and the clock advances again on tab reactivation.

## Verification

- Focused Vitest: 85 tests passed across viewport tests and Workspace component tests.
- Viewport and UI TypeScript checks passed.
- Scoped Biome check passed for all ten changed source/test files.
- All nine existing and new viewport production-build browser tests passed in Chromium with the Metal backend.
- Interactive agent-browser check: played the golem, opened the blob, and verified the hidden golem stayed at `0.46650000000000014` seconds with `playing: true` across 400 ms. Inspected a rendered screenshot of the blob with both asset tabs present; the golem screenshot also rendered correctly.
- Whole-workspace verification is reported by the coordinating agent.

An initial sandboxed browser launch was unable to bind localhost (`EPERM`); the authorized rerun with browser/socket access completed. This was an execution restriction, not a product failure. The initial hidden-tab test locator was corrected before the meaningful RED result above.
