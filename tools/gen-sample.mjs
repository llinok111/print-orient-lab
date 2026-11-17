// Deterministic sample builder: writes data/meshes.json (no timings, so two
// runs produce byte-identical output).
import { mkdirSync, writeFileSync } from "node:fs";
import { KINDS, makeMesh, prepare, optimalOrientation, downRatio, fingerprint } from "../src/core.mjs";

const THETA = 45;
mkdirSync(new URL("../data/", import.meta.url), { recursive: true });

const out = { version: 1, thetaDeg: THETA, generator: "tools/gen-sample.mjs", meshes: [] };
for (const kind of KINDS) {
  const mesh = makeMesh(kind);
  const p = prepare(mesh);
  const opt = optimalOrientation(p, THETA);
  out.meshes.push({
    kind,
    name: p.name,
    vertices: p.vertices,
    faces: p.faces,
    totalArea: p.totalArea,
    asAuthoredRatio: downRatio(p, [0, 0, 1], THETA),
    optimal: {
      dir: opt.dir,
      ratio: opt.ratio,
      candidates: opt.candidates,
      fingerprint: fingerprint(p, opt.dir, THETA),
    },
  });
}
const path = new URL("../data/meshes.json", import.meta.url);
writeFileSync(path, JSON.stringify(out));
console.log("wrote data/meshes.json", out.meshes.length, "meshes");
for (const m of out.meshes) {
  console.log(
    `${m.kind.padEnd(8)} tris=${String(m.faces.length).padStart(3)} area=${m.totalArea.toFixed(3)} ` +
      `as-authored=${(m.asAuthoredRatio * 100).toFixed(2)}% optimal=${(m.optimal.ratio * 100).toFixed(2)}% ` +
      `candidates=${m.optimal.candidates} fp=${m.optimal.fingerprint}`,
  );
}