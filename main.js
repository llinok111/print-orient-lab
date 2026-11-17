import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { prepare, optimalOrientation, downRatio, fingerprint, scaleMesh } from "./src/core.mjs";

const $ = (id) => document.getElementById(id);
const data = await (await fetch("./data/meshes.json")).json();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1117);
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.01, 100);
camera.up.set(0, 0, 1);
camera.position.set(3.6, -4.2, 3.2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
$("app").appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xdde8ff, 0x1a2230, 1.1));
const key = new THREE.DirectionalLight(0xffffff, 2.1);
key.position.set(3, -4, 6);
scene.add(key);

const grid = new THREE.GridHelper(8, 32, 0x2f3b4f, 0x1c2534);
grid.rotation.x = Math.PI / 2;
scene.add(grid);

// ---------- model state ----------
const state = { index: 0, theta: 45, dir: [0, 0, 1], prepared: null, group: null, mesh: null };
const selector = $("mesh");
data.meshes.forEach((m, i) => {
  const o = document.createElement("option");
  o.value = i;
  o.textContent = `${m.kind} — ${m.faces.length} tris`;
  selector.appendChild(o);
});

function sampledBest(p, theta, n = 512) {
  const ga = Math.PI * (3 - Math.sqrt(5));
  let best = Infinity;
  for (let i = 0; i < n; i++) {
    const z = 1 - (2 * i + 1) / n;
    const r = Math.sqrt(Math.max(0, 1 - z * z));
    const a = ga * i;
    best = Math.min(best, downRatio(p, [r * Math.cos(a), r * Math.sin(a), z], theta));
  }
  return best;
}

function buildGeometry(mesh) {
  const pos = new Float32Array(mesh.faces.length * 9);
  const col = new Float32Array(mesh.faces.length * 9);
  mesh.faces.forEach((f, i) => {
    f.forEach((vi, k) => {
      const v = mesh.vertices[vi];
      pos.set([v[0], v[1], v[2]], i * 9 + k * 3);
    });
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

function recolor() {
  const { prepared, theta, dir } = state;
  const c = Math.cos((theta * Math.PI) / 180) + 1e-12;
  const colors = state.mesh.geometry.attributes.color;
  prepared.tri.forEach((t, i) => {
    const down = t.n[0] * dir[0] + t.n[1] * dir[1] + t.n[2] * dir[2] < -c;
    const rgb = down ? [0.95, 0.22, 0.18] : [0.36 + 0.1 * Math.abs(t.n[2]), 0.46, 0.62];
    for (let k = 0; k < 3; k++) colors.setXYZ(i * 3 + k, rgb[0], rgb[1], rgb[2]);
  });
  colors.needsUpdate = true;
  updateHud();
}

function updateHud() {
  const { prepared, theta, dir } = state;
  const ratio = downRatio(prepared, dir, theta);
  const opt = optimalOrientation(prepared, theta);
  const baked = data.meshes[state.index];
  $("ratio").textContent = (ratio * 100).toFixed(3) + "%";
  $("best").textContent = (opt.ratio * 100).toFixed(3) + "%";
  $("sampled").textContent = (sampledBest(prepared, theta) * 100).toFixed(3) + "%";
  $("cand").textContent = String(opt.candidates);
  const fp = fingerprint(prepared, opt.dir, theta);
  const match = theta === 45 && fp === baked.optimal.fingerprint;
  $("fp").textContent = fp + (theta === 45 ? (match ? "  ✓ node" : "  ✗ mismatch") : "");
  $("fp").className = theta === 45 ? (match ? "ok" : "warn") : "";
  state.opt = opt;
}

function setOrientation(dir) {
  state.dir = dir;
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...dir).normalize(), new THREE.Vector3(0, 0, 1));
  state.group.quaternion.copy(q);
  recolor();
}

function load(index) {
  state.index = index;
  if (state.mesh) { scene.remove(state.group); state.mesh.geometry.dispose(); state.mesh.material.dispose(); }
  const m = data.meshes[index];
  state.prepared = prepare({ name: m.kind, vertices: m.vertices, faces: m.faces });
  state.mesh = new THREE.Mesh(
    buildGeometry(m),
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.72, metalness: 0.04 }),
  );
  state.group = new THREE.Group();
  state.group.add(state.mesh);
  scene.add(state.group);
  const baked = m.optimal;
  setOrientation(baked.dir);
  const box = new THREE.Box3().setFromObject(state.group);
  grid.position.z = box.min.z - 0.12;
}

selector.onchange = () => load(Number(selector.value));
$("theta").oninput = (e) => {
  state.theta = Number(e.target.value);
  $("thetaLabel").textContent = state.theta + "°";
  recolor();
};
$("authored").onclick = () => setOrientation([0, 0, 1]);
$("optimal").onclick = () => setOrientation(state.opt.dir);

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

load(0);
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });