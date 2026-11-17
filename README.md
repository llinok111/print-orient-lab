# print-orient-lab

**Exact minimum-overhang build orientation, computed as a finite arrangement search on the sphere: 1.78 ms median vs 28.04 ms for a 200,000-direction brute-force baseline (15.7×), with an argument that no orientation is missed — 1,200,000 random directions found 0 better.**

Upstream: none

A slicer user rotates a part by hand or picks one of six axis-aligned presets. Sampling
thousands of orientations is the usual automatic substitute. This tool does neither: the
overhang ratio is constant on each cell of the arrangement of the threshold circles
`n_i · d = -cos(theta)`, so the global minimum is attained at an arrangement vertex or in a
cell centre. Enumerating those candidates gives the exact optimum instead of a lucky sample.

## Run it

```bash
node tools/gen-sample.mjs && node bench/verify.mjs && node bench/bench.mjs
python3 -m http.server 4173   # then open http://localhost:4173
```

No `npm install`, no bundler, no headless browser. Node v24. The page loads three.js 0.169.0
from a pinned CDN importmap and recomputes the same core in the browser.

## Evidence (real runs)

`bench/result.json`, 6 samples per mesh, cold start recorded separately.

| mesh | tris | candidates | as-authored | exact optimum | exact median | 512-sample | 200k-sample | 200k median |
|---|---|---|---|---|---|---|---|---|
| tetra | 4 | 1,038 | 0.000% | 0.000% | 1.78 ms | 0.000% | 0.000% | 19.98 ms |
| cube | 12 | 1,042 | 16.667% | **0.000%** | 1.52 ms | 0.000% | 0.000% | 24.15 ms |
| icosa | 80 | 5,454 | 14.776% | **11.194%** | 17.67 ms | 11.194% | 11.194% | 77.20 ms |
| torus | 256 | 3,753 | 24.829% | **6.293%** | 7.37 ms | 6.293% | 6.293% | 182.84 ms |
| bracket | 20 | 1,042 | 18.304% | **0.000%** | 1.07 ms | 0.000% | 0.000% | 28.04 ms |
| tent | 8 | 1,040 | 20.711% | **0.000%** | 1.14 ms | 0.000% | 0.000% | 23.33 ms |

- `node bench/verify.mjs` → **68 passed / 0 failed**. It recomputes normals, areas and the
  projected-area identity independently, and runs **200,000 LCG random directions per mesh**
  (1.2M total): **0** were strictly better than the candidate-set optimum, 187,489 ties.
- Global optimality is a finite argument, not a statistical claim: the ratio is piecewise
  constant; break curves are the `n_i · d = -cos(theta)` circles; candidates enumerate every
  cap centre `-n_i`, every pairwise circle intersection, the normalised sum of cap centres for
  disjoint caps, and 1,024 fixed quasi-uniform seeds for cells whose boundary is made only of
  full circles (they have no vertex). The 1.2M-direction check is the adversarial audit.
- Scale behaviour: the same geometry at 1e-6 / 1e-3 / 1e3 / 1e6 returns the same direction
  (max component delta 5.6e-17) and the same ratio (max relative delta 2.9e-15). The search
  compares **normalised ratios**, so the decision is scale invariant; the only threshold is a
  dimensionless cosine tolerance of `1e-12`.
- Cold start is recorded per mesh in `bench/result.json` (e.g. cube 5.0 ms, icosa 16.7 ms).
  The largest RSD is 103% for tetra: a ~1 ms budget is dominated by timer granularity and GC.
  Medians are stable across repeats; no number here is rounded up from a single run.

Reproduce the baseline: `baseline/naive.mjs` is the 512-direction Fibonacci explorer; the
200k direction budget is timed in `bench/bench.mjs` over its own direction list.

## What the browser shows

Load a mesh, drag the threshold slider, orbit the part. Red faces are down-facing at the
current threshold and build direction. The HUD recomputes the ratio, the exact optimum,
the 512-sample estimate and a FNV-1a fingerprint in the browser using `src/core.mjs`; at
45° that fingerprint must equal the node-baked one in `data/meshes.json` (shown as `✓ node`).
The model is rotated so the chosen build direction points up; the grid is the build plate.

## 本轮创新

**B 档：把“找一个好的打印方向”从采样启发式变成球面排列上的精确有限枚举。** 已有切片器
的自动摆向、以及本仓库的 512/200k 基线都是采样（结果随预算与运气变化，且无法证明最优）；
这里把悬垂面积是球面分段常数的结构显式化，逐条列出候选（阈值圆交点、冠心、无顶点胞的
种子），并公开候选集、给出 1.2M 方向的反向审计与 1e-6…1e6 的尺度不变性。新在“可复算的
全局最优候选集 + 浏览器与 node 同一 core 的指纹一致”，不是又换一个模型或配色。

## Known limitations

- The metric is **raw overhang surface area ratio**, not support volume or print time. Two
  faces at different heights contribute equally here.
- Corpus is deliberately small and low-poly (6 meshes, 8–256 triangles) so every number is
  reproducible in seconds. On this corpus the 512-sample explorer **matched the optimum on all
  6 meshes** — the exact search's win here is the optimality guarantee and 15.7× over the
  200k budget, not a better ratio. Do not read the table as "sampling is inaccurate".
- The 1,024 seeds are a fixed coverage aid for vertex-free cells; they are part of the
  candidate set, not a random search, and results are deterministic.
- The `1e-12` cosine tolerance means a face within 1e-12 of the threshold counts as supported.
  The `tent` mesh is the boundary case (two faces exactly at 45°); it is included to keep the
  tangency behaviour honest, not to make the baseline look bad.
- The browser path is verified by HTTP 200 + importmap presence + node-side fingerprint match;
  no headless-browser pixel verification is performed (forbidden in this environment).

MIT licensed. No third-party code copied; three.js is loaded at runtime, not vendored.