# Scene and re-anchoring repairs

Implemented A05, A06 and A10 from the codebase audit in the shared checkout. The approved audit repair request supplied the TDD plan authorization. No branches, worktrees, commits, sample regeneration or WASM changes were made.

## A05: Composition morph tracks

Weights tracks now bind by unique morph-target name rather than array position. Unmatched destination targets keep their default weights. A missing source identity or a name duplicated in either file is not guessed: its destination keeps its default and the clip gets one `invalid-data` warning listing the missing/ambiguous source identities. Existing warning contracts are unchanged. Original track buffers remain unchanged.

TDD evidence:

1. `pnpm exec vitest run packages/scene/src/composition.test.ts -t 'animates the named morph'` failed because a Blink animation moved the test vertex to `[1, 0, 0]` instead of `[0, 1, 0]`. Name remapping made it pass.
2. `pnpm exec vitest run packages/scene/src/composition.test.ts -t 'keeps defaults for unmatched'` failed with `[3, 4, 1]` instead of `[1.5, 1, 1]`. Rejecting ambiguous identities, preserving defaults and reporting unbound source targets made it pass.

These tests assert the vertex position resulting from the composed morph keys, the reordered values and preservation of the source values. The second case covers missing, extra and duplicate targets in both source and destination.

## A06: Explicit joint attachments

Composition now places all explicit attachment nodes before importing their meshes and filling unresolved skeleton dependencies. The mesh pass takes a snapshot of explicitly placed nodes, so dependency-only nodes do not accidentally bring unrelated geometry into the view. Existing first-explicit-placement precedence and specific-node-before-whole-file ordering are preserved.

TDD evidence:

1. `pnpm exec vitest run packages/scene/src/composition.test.ts -t 'drives another file'` failed with Flap parent `-1` instead of the model Body index `1`. Deferring skeleton resolution made the corrected existing test pass. It also verifies unchanged rest placement and that moving Body moves Flap by the same amount.
2. Four attachment-order cases cover mesh-first, joint-first, whole-file entries and a later competing explicit entry. They assert parent-before-child ordering, stable member paths, joint mapping and one mesh part.
3. `pnpm exec vitest run packages/scene/src/composition.test.ts -t 'keeps meshes outside'` exposed an intermediate regression: dependency resolution added a third mesh when two were expected. Snapshotting explicit nodes before the mesh pass made it pass and keeps dependency-only mesh nodes without geometry.

## A10: Exact reusable vertex index

Added `VertexIndex` to the scene package's public exports. It builds a balanced spatial tree over a separate source-index array; source positions and source numbering are never reordered. Queries use bounding boxes and preserve the existing full scan's exact distance and lowest-source-index tie behavior. Nonfinite coordinates/queries and empty inputs have the same results as the reference `nearestVertex`, which remains available unchanged.

The re-anchorer builds an index lazily per destination mesh for regions with at least 128 saved positions and reuses it for every subsequent region and comment in that re-anchoring pass. Smaller regions use the retained linear scan until an index already exists, avoiding construction overhead for tiny workloads. Tree construction currently sorts recursively; indexed queries avoid scanning distant vertices.

TDD and regression evidence:

1. `pnpm exec vitest run packages/scene/src/vertex-index.test.ts` initially failed because the new index module did not exist. The implemented public API passed exact nearest-source, cross-partition tie and source-order assertions.
2. 1,536 comparisons against the retained brute-force implementation cover a deterministic random cloud, a grid, collinear and duplicate points, extreme float32 magnitudes, empty inputs and nonfinite values. Returned indices and distances must match exactly.
3. A repeated-comment core regression verifies that equal-distance region mappings keep the lowest source index and return the correct new anchor/rest positions.
4. A deterministic performance regression measures real input coordinate reads for 128 queries over 4,096 grid vertices. It requires at least a 20-fold reduction from the full-scan workload without any wall-clock threshold. Measured: 6,144 indexed reads versus 1,572,864 full-scan reads, a 256-fold reduction.
5. Final review caught the index's fixed construction cost for tiny regions. `pnpm exec vitest run packages/core/src/reanchor.test.ts -t 'reanchors a tiny region'` failed with 517,307 coordinate reads, exceeding a generous two-scan budget of 24,576 reads for a one-position region on 4,096 vertices. The 128-position threshold made it pass without changing the mapped source vertex. A second regression verifies that a tiny region following a large one reuses the existing index, requiring fewer than one twentieth of a full scan's coordinate reads.

Reproducible benchmark: `node /private/tmp/arcue-scene-index-benchmark.mjs`. It imports current source in memory, compares every result with `nearestVertex`, and writes no repository output. Node 26.7.0 on this host, 100,000 destination vertices, 30 warm-up queries:

| Selected vertices | Full scan | Indexed queries | One-time index build | Exact equal results |
|---|---:|---:|---:|---|
| 1,000 | 111 ms | 3 ms | 101 ms | Yes |
| 10,000 | 1,024 ms | 10 ms | Same reused index | Yes |

These are local measurements, not universal latency guarantees. Including the first build, the 10,000-query workload fell from approximately 1,024 ms to 111 ms; later regions reuse that index.

The table measures large-workload indexing. A tiny region no longer pays the approximately 101 ms construction cost: it keeps the original scan cost unless a previous large region has already built the index.

## Validation

- `pnpm exec vitest run packages/scene packages/core/src/reanchor.test.ts packages/import-fbx/src/composition.test.ts`: passed, 119 tests in 15 files.
- `pnpm --filter @arcue/scene --filter @arcue/core typecheck`: passed.
- Biome checks/formatting were scoped to the seven changed TypeScript files.
- After the tiny-region follow-up: re-anchor and vertex-index tests passed, 15 tests in two files; core typecheck and scoped Biome passed.

The parent agent runs the final repository-wide checks alongside the other concurrent repairs. No browser rendering changes are included in this workstream.
