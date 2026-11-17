// Assertions. Independent oracle: normals, areas and random directions are
// recomputed here without importing the core's sampling or constants.
import { readFileSync } from "node:fs";
import {
  KINDS, makeMesh, prepare, scaleMesh, optimalOrientation, downRatio, downArea, fingerprint,
} from "../src/core.mjs";

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log(`PASS ${name}${detail ? " :: " + detail : ""}`); }
  else { fail++; console.log(`FAIL ${name}${detail ? " :: " + detail : ""}`); }
}
const rel = (a, b) => Math.abs(a - b) / Math.max(1e-300, Math.abs(a), Math.abs(b));

// ---------- independent geometry oracle ----------
function oracleMesh(mesh) {
  const ns = [], areas = [];
  let total = 0;
  for (const [a, b, c] of mesh.faces) {
    const A = mesh.vertices[a], B = mesh.vertices[b], C = mesh.vertices[c];
    const u = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const v = [C[0] - A[0], C[1] - A[1], C[2] - A[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(n[0], n[1], n[2]);
    areas.push(l / 2);
    total += l / 2;
    ns.push([n[0] / l, n[1] / l, n[2] / l]);
  }
  return { ns, areas, total };
}
function oracleDown(o, d, thetaDeg) {
  const c = Math.cos((thetaDeg * Math.PI) / 180);
  let area = 0;
  for (let i = 0; i < o.ns.length; i++) {
    const n = o.ns[i];
    if (n[0] * d[0] + n[1] * d[1] + n[2] * d[2] < -c) area += o.areas[i];
  }
  return area;
}
// Deterministic LCG, deliberately different from core.spiralDirections().
function lcgDirections(n) {
  let s = 0x9e3779b9;
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const out = [];
  for (let i = 0; i < n; i++) {
    const z = 2 * rnd() - 1;
    const a = 2 * Math.PI * rnd();
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    out.push([r * Math.cos(a), r * Math.sin(a), z]);
  }
  return out;
}

const baked = JSON.parse(readFileSync(new URL("../data/meshes.json", import.meta.url), "utf8"));
const RANDOM = 200000;
const dirs = lcgDirections(RANDOM);
let globalRandomBeats = 0;
let globalTies = 0;

for (const kind of KINDS) {
  const mesh = makeMesh(kind);
  const p = prepare(mesh);
  const o = oracleMesh(mesh);
  const b = baked.meshes.find((m) => m.kind === kind);
  const opt = optimalOrientation(p, 45);
  const authored = downRatio(p, [0, 0, 1], 45);

  // 1. closedness: sum of area-weighted normals is zero for a closed surface.
  let sx = 0, sy = 0, sz = 0;
  for (let i = 0; i < o.ns.length; i++) {
    sx += o.ns[i][0] * o.areas[i]; sy += o.ns[i][1] * o.areas[i]; sz += o.ns[i][2] * o.areas[i];
  }
  const closure = Math.hypot(sx, sy, sz) / p.totalArea;
  check(`${kind}:closed`, closure < 1e-9, `|sum A n|/A = ${closure.toExponential(3)}`);

  // 2. oracle normals agree with core normals (definition check, not shared code).
  let maxN = 0;
  for (let i = 0; i < o.ns.length; i++) {
    const n = p.tri[i].n;
    maxN = Math.max(maxN, Math.hypot(n[0] - o.ns[i][0], n[1] - o.ns[i][1], n[2] - o.ns[i][2]));
  }
  check(`${kind}:oracle-normals`, maxN < 1e-12, `max |dn| = ${maxN.toExponential(3)}`);

  // 3. silhouette identity at theta=90: down area equals up area.
  // Projected area identity: sum A*max(0,n·d) == sum A*max(0,-n·d) for a
  // closed surface.  This weights each face by |n·d|, unlike raw overhang area.
  let proj = 0;
  for (let i = 0; i < o.ns.length; i++) proj += o.areas[i] * Math.max(0, o.ns[i][2]);
  let projUp = 0;
  for (let i = 0; i < o.ns.length; i++) projUp += o.areas[i] * Math.max(0, -o.ns[i][2]);
  check(`${kind}:projected-area-identity`, rel(proj, projUp) < 1e-12,
    `down=${proj.toFixed(9)} up=${projUp.toFixed(9)} rel=${rel(proj, projUp).toExponential(2)}`);

  // 4. optimum never worse than the authored pose.
  check(`${kind}:beats-authored`, opt.ratio <= authored + 1e-15,
    `${(authored * 100).toFixed(3)}% -> ${(opt.ratio * 100).toFixed(3)}%`);

  // 5. independent dense random search never strictly beats the candidate set.
  let bestRand = Infinity, ties = 0, beats = 0;
  for (const d of dirs) {
    const a = oracleDown(o, d, 45) / o.total;
    if (a < bestRand) bestRand = a;
    if (a < opt.ratio - 1e-12) beats++;
    if (Math.abs(a - opt.ratio) < 1e-12) ties++;
  }
  globalRandomBeats += beats;
  globalTies += ties;
  check(`${kind}:random-${RANDOM}-never-better`, beats === 0,
    `best random=${(bestRand * 100).toFixed(4)}% opt=${(opt.ratio * 100).toFixed(4)}% beats=${beats} ties=${ties}`);

  // 6. determinism: same inputs, bit-identical direction and ratio.
  const again = optimalOrientation(p, 45);
  check(`${kind}:deterministic`,
    again.ratio === opt.ratio && again.dir.every((v, i) => v === opt.dir[i]),
    `ratio=${opt.ratio.toFixed(12)} candidates=${opt.candidates}`);

  // 7. baked artefact matches a fresh computation (including fingerprint).
  const fp = fingerprint(p, opt.dir, 45);
  check(`${kind}:baked-matches`, fp === b.optimal.fingerprint &&
    rel(opt.ratio, b.optimal.ratio) < 1e-12 &&
    opt.dir.every((v, i) => Math.abs(v - b.optimal.dir[i]) < 1e-12),
    `fp ${fp} vs ${b.optimal.fingerprint}`);

  // 8. scale invariance 1e-6 .. 1e6: same direction, same ratio.
  for (const s of [1e-6, 1e-3, 1e3, 1e6]) {
    const ps = prepare(scaleMesh(mesh, s));
    const os = optimalOrientation(ps, 45);
    const dDiff = Math.max(...os.dir.map((v, i) => Math.abs(v - opt.dir[i])));
    check(`${kind}:scale-${s}`, dDiff < 1e-9 && rel(os.ratio, opt.ratio) < 1e-12,
      `dDir=${dDiff.toExponential(2)} dRatio=${rel(os.ratio, opt.ratio).toExponential(2)}`);
  }
}

// 9. threshold monotonicity: larger threshold includes more faces as overhang.
{
  const p = prepare(makeMesh("torus"));
  const r30 = optimalOrientation(p, 30).ratio;
  const r45 = optimalOrientation(p, 45).ratio;
  const r60 = optimalOrientation(p, 60).ratio;
  check("torus:threshold-monotone", r30 <= r45 + 1e-15 && r45 <= r60 + 1e-15,
    `30=${(r30 * 100).toFixed(3)}% 45=${(r45 * 100).toFixed(3)}% 60=${(r60 * 100).toFixed(3)}%`);
}

// 10. analytic check: the unit cube has exactly 24 units of surface area.
{
  const p = prepare(makeMesh("cube"));
  check("cube:analytic-area", Math.abs(p.totalArea - 24) < 1e-12, `area=${p.totalArea}`);
}

console.log(`\n${pass} passed / ${fail} failed | global random beats=${globalRandomBeats} ties=${globalTies}`);
process.exit(fail === 0 ? 0 : 1);