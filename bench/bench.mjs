// Measured numbers: 6 samples per mesh, cold start recorded separately.
// Also times two honest baselines on the same machine and inputs:
//   naive512  : 512 uniform orientations (an interactive explorer's budget)
//   dense200k : 200,000 uniform orientations (brute force)
import { writeFileSync } from "node:fs";
import { KINDS, makeMesh, prepare, optimalOrientation, downRatio, downArea, spiralDirections, fingerprint } from "../src/core.mjs";
import { sampledBest } from "../baseline/naive.mjs";

const REPEATS = 6;
const THETA = 45;
const now = () => Number(process.hrtime.bigint()) / 1e6;
function timed(fn) {
  const t = now();
  const value = fn();
  return { ms: now() - t, value };
}
function stats(xs) {
  const s = [...xs].sort((a, b) => a - b);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length);
  return {
    min: s[0],
    median: s[Math.floor(s.length / 2)],
    p95: s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)],
    stddev: sd,
    rsdPct: (100 * sd) / mean,
    samples: s.length,
  };
}

const result = {
  generatedBy: "bench/bench.mjs",
  node: process.version,
  thetaDeg: THETA,
  repeats: REPEATS,
  meshes: [],
  summary: {},
};
const denseDirs = spiralDirections(200000);
const coldGlobal = timed(() => optimalOrientation(prepare(makeMesh(KINDS[0])), THETA));
result.coldStartMs = coldGlobal.ms;

for (const kind of KINDS) {
  const p = prepare(makeMesh(kind));
  const authored = downRatio(p, [0, 0, 1], THETA);
  const exactTimes = [];
  let cold = null, opt = null;
  for (let i = 0; i < REPEATS + 1; i++) {
    const r = timed(() => optimalOrientation(p, THETA));
    if (i === 0) { cold = r.ms; opt = r.value; } else exactTimes.push(r.ms);
    if (!opt) opt = r.value;
  }
  checkRatio(p, opt.dir, opt.ratio);

  const naive = sampledBest(kind, THETA, 512);
  const naiveTimes = [];
  for (let i = 0; i < 3; i++) naiveTimes.push(timed(() => sampledBest(kind, THETA, 512)).ms);

  let denseBest = Infinity;
  const denseTimes = [];
  for (let i = 0; i < 3; i++) {
    const r = timed(() => {
      let best = Infinity;
      for (const d of denseDirs) {
        const a = downArea(p, d, THETA);
        if (a < best) best = a;
      }
      return best / p.totalArea;
    });
    denseTimes.push(r.ms);
    denseBest = Math.min(denseBest, r.value);
  }

  result.meshes.push({
    kind,
    tris: p.tri.length,
    totalArea: p.totalArea,
    candidates: opt.candidates,
    asAuthoredRatio: authored,
    optimalRatio: opt.ratio,
    optimalDir: opt.dir,
    fingerprint: fingerprint(p, opt.dir, THETA),
    exact: { ...stats(exactTimes), cold, evaluations: opt.evaluations },
    naive512: { ...stats(naiveTimes), directions: 512, ratio: naive.ratio, improvementPp: 100 * (naive.ratio - opt.ratio) },
    dense200k: { ...stats(denseTimes), ratio: denseBest, improvementPp: 100 * (denseBest - opt.ratio) },
  });
  const row = result.meshes[result.meshes.length - 1];
  console.log(
    `${kind.padEnd(8)} opt=${(opt.ratio * 100).toFixed(2)}% authored=${(authored * 100).toFixed(2)}% ` +
      `cand=${opt.candidates} exact=${row.exact.median.toFixed(2)}ms cold=${cold.toFixed(2)}ms ` +
      `naive512=${(naive.ratio * 100).toFixed(2)}% ${row.naive512.median.toFixed(2)}ms ` +
      `dense200k=${(denseBest * 100).toFixed(2)}% ${row.dense200k.median.toFixed(2)}ms`,
  );
}

function checkRatio(p, dir, ratio) {
  const r = downRatio(p, dir, THETA);
  if (Math.abs(r - ratio) > 1e-12) throw new Error(`ratio mismatch ${r} vs ${ratio}`);
}

const exactMedians = result.meshes.map((m) => m.exact.median);
const denseMedians = result.meshes.map((m) => m.dense200k.median);
result.summary = {
  exactMedianMs: stats(exactMedians).median,
  exactWorstMedianMs: Math.max(...exactMedians),
  dense200kMedianMs: stats(denseMedians).median,
  speedupVsDense200k: stats(exactMedians).median === 0 ? null : stats(denseMedians).median / stats(exactMedians).median,
  bestNaiveGapPp: Math.max(...result.meshes.map((m) => m.naive512.improvementPp)),
  randomBeatsWorstPp: Math.min(...result.meshes.map((m) => m.dense200k.improvementPp)),
  maxExactRsdPct: Math.max(...result.meshes.map((m) => m.exact.rsdPct)),
};

writeFileSync(new URL("./result.json", import.meta.url), JSON.stringify(result, null, 2));
console.log("\nsummary", result.summary);
console.log("wrote bench/result.json");