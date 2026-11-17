// Pure geometry core: no three.js, no DOM, no filesystem, no environment reads.
//
// Build-orientation search for FDM printing.
// A triangle is "overhang" for build direction d when its outward normal n
// satisfies n·d < -cos(theta).  The overhang ratio is the overhang area divided
// by the total surface area.  The ratio is piecewise constant on the sphere and
// its break curves are the circles n_i·d = -cos(theta).  The global minimum is
// therefore attained at a vertex of that arrangement or at the centre of a
// cell that is a single cap; we enumerate exactly those candidates.

export const KINDS = ["tetra", "cube", "icosa", "torus", "bracket", "tent"];

const EPS = 1e-12;

function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function norm(a) { return Math.hypot(a[0], a[1], a[2]); }
function unit(a) {
  const l = norm(a);
  if (!(l > 0)) return [0, 0, 1];
  return [a[0] / l, a[1] / l, a[2] / l];
}

// ---------- generators (closed, outward oriented) ----------
function tetra() {
  const v = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
  const f = [[0, 1, 2], [0, 3, 1], [0, 2, 3], [1, 3, 2]];
  return { name: "tetra", vertices: v, faces: f };
}

function cube() {
  const v = [];
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) v.push([x, y, z]);
  // index = (x?4:0)+(y?2:0)+(z?1:0)
  const f = [
    [0, 1, 3], [0, 3, 2],       // x = -1
    [4, 6, 7], [4, 7, 5],       // x = +1
    [0, 4, 5], [0, 5, 1],       // y = -1
    [2, 3, 7], [2, 7, 6],       // y = +1
    [0, 2, 6], [0, 6, 4],       // z = -1
    [1, 5, 7], [1, 7, 3],       // z = +1
  ];
  return { name: "cube", vertices: v, faces: f };
}

function icosa(subdiv = 1) {
  const t = (1 + Math.sqrt(5)) / 2;
  let v = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(unit);
  let f = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let s = 0; s < subdiv; s++) {
    const cache = new Map();
    const mid = (a, b) => {
      const key = a < b ? a + ":" + b : b + ":" + a;
      if (cache.has(key)) return cache.get(key);
      const p = unit([
        (v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2,
      ]);
      v.push(p);
      cache.set(key, v.length - 1);
      return v.length - 1;
    };
    const nf = [];
    for (const [a, b, c] of f) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    f = nf;
  }
  return { name: "icosa" + (subdiv ? "-s" + subdiv : ""), vertices: v, faces: f };
}

function torus(R = 1, r = 0.38, su = 16, sv = 8) {
  const v = [], f = [];
  for (let i = 0; i < su; i++) {
    const u = (2 * Math.PI * i) / su;
    for (let j = 0; j < sv; j++) {
      const w = (2 * Math.PI * j) / sv;
      v.push([(R + r * Math.cos(w)) * Math.cos(u), (R + r * Math.cos(w)) * Math.sin(u), r * Math.sin(w)]);
    }
  }
  const id = (i, j) => (i % su) * sv + (j % sv);
  for (let i = 0; i < su; i++) {
    for (let j = 0; j < sv; j++) {
      const a = id(i, j), b = id(i + 1, j), c = id(i + 1, j + 1), d = id(i, j + 1);
      f.push([a, b, c], [a, c, d]);
    }
  }
  return { name: "torus", vertices: v, faces: f };
}

// L-shaped bracket extruded in z: a shape that needs support in every pose.
function bracket() {
  const poly = [[0, 0], [2, 0], [2, 0.7], [0.7, 0.7], [0.7, 2], [0, 2]];
  const v = [];
  for (const z of [0, 1]) for (const [x, y] of poly) v.push([x - 0.35, y - 1.0, z - 0.5]);
  const n = poly.length;
  const f = [];
  for (let i = 1; i < n - 1; i++) {
    f.push([0, i + 1, i]);            // bottom (z=0)
    f.push([n, n + i, n + i + 1]);    // top (z=1)
  }
  for (let i = 0; i < n; i++) {
    const a = i, b = (i + 1) % n;
    f.push([a, b, n + b], [a, n + b, n + a]);
  }
  return { name: "bracket", vertices: v, faces: f };
}

// Closed 90-degree V-block (a "tent"): its two large under-faces sit exactly
// on the 45-degree threshold when the ridge faces up, so the only support-free
// pose is the isolated tangency point of the two threshold circles.  A sampled
// orientation search cannot land on it; the arrangement search can.
function tent(w = 1, depth = 1, tilt = 30) {
  const y0 = -depth / 2, y1 = depth / 2;
  const b = (tilt * Math.PI) / 180, cb = Math.cos(b), sb = Math.sin(b);
  // Tilt about y so the unique support-free pose is not the as-authored pose.
  const v = [
    [-w, y0, 1], [w, y0, 1], [0, y0, 0],
    [-w, y1, 1], [w, y1, 1], [0, y1, 0],
  ].map(([x, y, z]) => [x * cb + z * sb, y, -x * sb + z * cb]);
  const f = [
    [0, 2, 1], [3, 4, 5],          // end caps
    [0, 1, 4], [0, 4, 3],          // top
    [0, 3, 5], [0, 5, 2],          // left under-face
    [1, 2, 5], [1, 5, 4],          // right under-face
  ];
  return { name: "tent", vertices: v, faces: f };
}

export function makeMesh(kind) {
  let m;
  if (kind === "tetra") m = tetra();
  else if (kind === "cube") m = cube();
  else if (kind === "icosa") m = icosa(1);
  else if (kind === "torus") m = torus();
  else if (kind === "bracket") m = bracket();
  else if (kind === "tent") m = tent();
  else throw new Error("unknown mesh kind: " + kind);
  ensureOutward(m);
  return m;
}

// Signed volume < 0 means the face winding points inward: flip every face.
export function ensureOutward(m) {
  let vol = 0;
  for (const [a, b, c] of m.faces) {
    vol += dot(m.vertices[a], cross(m.vertices[b], m.vertices[c])) / 6;
  }
  if (vol < 0) for (const f of m.faces) { const t = f[1]; f[1] = f[2]; f[2] = t; }
  return vol;
}

export function scaleMesh(m, s) {
  return {
    name: m.name,
    vertices: m.vertices.map((p) => [p[0] * s, p[1] * s, p[2] * s]),
    faces: m.faces.map((f) => f.slice()),
  };
}

// ---------- prepared data ----------
export function prepare(mesh) {
  const tri = [];
  let totalArea = 0;
  for (const [a, b, c] of mesh.faces) {
    const A = mesh.vertices[a], B = mesh.vertices[b], C = mesh.vertices[c];
    const cr = cross(sub(B, A), sub(C, A));
    const area = norm(cr) / 2;
    const n = unit(cr);
    totalArea += area;
    tri.push({ a: A, b: B, c: C, n, area });
  }
  return { name: mesh.name, vertices: mesh.vertices, faces: mesh.faces, tri, totalArea };
}

function cosOf(thetaDeg) {
  return Math.cos((thetaDeg * Math.PI) / 180);
}

// Overhang area for a unit build direction.
export function downArea(p, dir, thetaDeg) {
  const d = unit(dir);
  const c = cosOf(thetaDeg);
  let area = 0;
  // Angular tolerance on the cosine (dimensionless, scale invariant): a face
  // exactly on the threshold counts as supported, so tangency cases are stable.
  for (const t of p.tri) if (dot(t.n, d) < -c - 1e-12) area += t.area;
  return area;
}

export function downRatio(p, dir, thetaDeg) {
  return downArea(p, dir, thetaDeg) / p.totalArea;
}

// Exact global search: break circles n_i·d = -c; candidates are all pairwise
// circle intersections plus every cap centre (-n_i).  For any direction the
// ratio is constant inside one arrangement cell, and every cell's closure
// contains one of those candidates, so the minimum over all directions is the
// minimum over this finite set.
export function arrangementCandidates(p, thetaDeg) {
  const c = cosOf(thetaDeg);
  const dirs = [];
  const seen = new Set();
  const push = (d) => {
    const l = norm(d);
    if (!(l > EPS)) return;
    const u = [d[0] / l, d[1] / l, d[2] / l];
    if (!Number.isFinite(u[0]) || !Number.isFinite(u[1]) || !Number.isFinite(u[2])) return;
    const key = u[0].toFixed(11) + "," + u[1].toFixed(11) + "," + u[2].toFixed(11);
    if (seen.has(key)) return;
    seen.add(key);
    dirs.push(u);
  };
  const ns = p.tri.map((t) => t.n);
  const uniq = [];
  for (const n of ns) {
    if (!uniq.some((u) => Math.abs(dot(u, n) - 1) < 1e-10)) uniq.push(n);
  }
  for (const n of uniq) { push([-n[0], -n[1], -n[2]]); push(n); }
  // A cell whose boundary is made of full circles (no crossing) has no
  // arrangement vertex.  Such cells are either a cap (covered by -n_i) or the
  // complement of all caps; deterministic seeds cover the latter (and any
  // numerically missed sliver).  The seed set is fixed, so results are
  // reproducible; 200k independent random directions are used as a check.
  for (const d of spiralDirections(1024)) push(d);
  for (let i = 0; i < uniq.length; i++) {
    for (let j = i + 1; j < uniq.length; j++) {
      const ni = uniq[i], nj = uniq[j];
      const g = dot(ni, nj);
      const den = 1 - g * g;
      if (den < 1e-10) continue;
      const a = -c / (1 + g);
      const b = a;
      const t2 = (1 - (a * a + b * b + 2 * a * b * g)) / den;
      if (t2 < 0) {
        // Disjoint caps: the normalised sum of the two cap centres is a point
        // in the gap and, when the circles are tangent, the tangency itself.
        push([-(ni[0] + nj[0]), -(ni[1] + nj[1]), -(ni[2] + nj[2])]);
        continue;
      }
      const cr = cross(ni, nj);
      if (t2 < 1e-12) push([-(ni[0] + nj[0]), -(ni[1] + nj[1]), -(ni[2] + nj[2])]);
      const t = Math.sqrt(t2);
      push([a * ni[0] + b * nj[0] + t * cr[0], a * ni[1] + b * nj[1] + t * cr[1], a * ni[2] + b * nj[2] + t * cr[2]]);
      push([a * ni[0] + b * nj[0] - t * cr[0], a * ni[1] + b * nj[1] - t * cr[1], a * ni[2] + b * nj[2] - t * cr[2]]);
    }
  }
  return dirs;
}

export function optimalOrientation(p, thetaDeg) {
  const dirs = arrangementCandidates(p, thetaDeg);
  let best = null, bestArea = Infinity, bestRatio = Infinity;
  let evaluations = 0;
  for (const d of dirs) {
    const a = downArea(p, d, thetaDeg);
    evaluations++;
    // Compare normalized ratios, not raw areas: the decision (and therefore the
    // reported orientation) is then invariant under uniform scaling, which an
    // absolute tolerance would break.
    const ra = a / p.totalArea;
    if (ra < bestRatio - 1e-12) { bestRatio = ra; bestArea = a; best = d; }
  }
  return {
    dir: best,
    area: bestArea,
    ratio: bestRatio,
    candidates: dirs.length,
    evaluations,
    totalArea: p.totalArea,
  };
}

// Stable FNV-1a over the quantized result: the browser recomputes the same
// numbers with the same core and compares this string with the baked one.
export function fingerprint(p, dir, thetaDeg) {
  const q = (x) => Math.round(x * 1e9) / 1e9;
  let s = p.name + "|" + thetaDeg.toFixed(3) + "|" + q(dir[0]) + "," + q(dir[1]) + "," + q(dir[2]) + "|" + q(downRatio(p, dir, thetaDeg) * 1e12) + "|" + q(p.totalArea * 1e12);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Deterministic quasi-uniform directions (used by the in-repo baseline).
export function spiralDirections(n) {
  const out = [];
  const ga = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * i + 1) / n;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const a = ga * i;
    out.push([r * Math.cos(a), r * Math.sin(a), z]);
  }
  return out;
}