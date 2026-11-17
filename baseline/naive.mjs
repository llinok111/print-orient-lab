// Honest baseline: uniform orientation sampling with a Fibonacci spiral and a
// fixed budget, the way an interactive orientation explorer usually works.
// It shares only the mesh definition with the core; the search is its own.
import { makeMesh, prepare, downRatio } from "../src/core.mjs";

export const BASELINE_SAMPLES = 512;

export function sampledBest(kind, thetaDeg, samples = BASELINE_SAMPLES) {
  const p = prepare(makeMesh(kind));
  const ga = Math.PI * (3 - Math.sqrt(5));
  let best = null;
  let bestDir = null;
  for (let i = 0; i < samples; i++) {
    const z = 1 - (2 * i + 1) / samples;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const a = ga * i;
    const d = [r * Math.cos(a), r * Math.sin(a), z];
    const ratio = downRatio(p, d, thetaDeg);
    if (best === null || ratio < best) { best = ratio; bestDir = d; }
  }
  return { dir: bestDir, ratio: best, samples, totalArea: p.totalArea };
}