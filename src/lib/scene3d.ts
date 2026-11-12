// Draws a take as its own 3D video: for each beat, a small soft-lit diorama on a window sill,
// built from what the beat describes (rain, cloud, sun, moon, plants, a phone, little figures,
// a critter, a card, a countdown, a street, the end card), with camera moves and captions,
// recorded in the browser. Rendering follows the studio's own reel scenes: rounded shapes,
// soft shadows, filmic tone mapping, a gradient sky with fog, and a warm key / cool rim light.
// Every shape is built here from primitives; nothing is copied from anywhere.
import { visibleClock } from "./recclock";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export type CaptionLook = "balloon" | "bold" | "lower";
export type Look = { captions: CaptionLook; cutEvery?: number };
type Beat = { label: string; seconds: number };
type Kit = { group: THREE.Group; update: (t: number, k: number) => void };
type Mood = "day" | "rain" | "warm" | "night" | "end";

// Captions are laid out on a 720×1280 grid and scaled to the output size.
const BASE_W = 720, BASE_H = 1280;
const FONT = "'Inter Tight', Archivo, 'Helvetica Neue', Arial, sans-serif";

// ---- Small helpers ----------------------------------------------------------

function rng(seed: number) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
// A soft overshoot for things that pop in.
const spring = (x: number) => { const c = Math.min(1, Math.max(0, x)); return 1 - Math.cos(c * Math.PI * 2.5) * Math.exp(-c * 5.5); };

const mat = (color: number, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.78, metalness: 0, ...o });

function shade<T extends THREE.Object3D>(m: T, cast = true): T {
  m.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = cast; o.receiveShadow = true; } });
  return m;
}
function rbox(w: number, h: number, d: number, color: number | THREE.Material, r = 0.06, o: THREE.MeshStandardMaterialParameters = {}) {
  const geo = new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2.2, h / 2.2, d / 2.2));
  return shade(new THREE.Mesh(geo, typeof color === "number" ? mat(color, o) : color));
}
function ball(r: number, color: number | THREE.Material, o: THREE.MeshStandardMaterialParameters = {}) {
  return shade(new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), typeof color === "number" ? mat(color, o) : color));
}
function pill(r: number, len: number, color: number, o: THREE.MeshStandardMaterialParameters = {}) {
  return shade(new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 10, 24), mat(color, o)));
}
const at = <T extends THREE.Object3D>(m: T, x: number, y: number, z: number) => { m.position.set(x, y, z); return m; };

function glowTexture(inner = "rgba(255,244,214,1)") {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d")!, g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, inner); g.addColorStop(0.35, inner.replace(/[\d.]+\)$/, "0.45)")); g.addColorStop(1, inner.replace(/[\d.]+\)$/, "0)"));
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function glow(size: number, color = "rgba(255,244,214,1)", opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(color), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  s.scale.setScalar(size); return s;
}

function gradientTexture(top: string, bottom: string, horizon?: string) {
  const c = document.createElement("canvas"); c.width = 4; c.height = 512;
  const x = c.getContext("2d")!, g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, top); if (horizon) g.addColorStop(0.62, horizon); g.addColorStop(1, bottom);
  x.fillStyle = g; x.fillRect(0, 0, 4, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function wrapText(s: string, max: number) {
  const out: string[] = []; let cur = "";
  for (const w of s.split(/\s+/)) { if ((cur + " " + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + " " + w).trim(); }
  if (cur) out.push(cur); return out.slice(0, 3);
}

function textCanvas(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ---- Moods -------------------------------------------------------------------

const MOODS: Record<Mood, {
  sky: [string, string, string]; fog: number; hemi: [number, number, number]; key: [number, number]; rim: [number, number];
  bloom: number; exposure: number; wall: number; lit: boolean; stars: boolean; houses: number[]; ground: number; hills: number[];
}> = {
  day: { sky: ["#4f78d8", "#f3d9c6", "#a9c3f4"], fog: 0xc9d6f2, hemi: [0xe6ecff, 0x6b4c3c, 1.05], key: [0xfff0dc, 2.1], rim: [0xa9c0ff, 0.6], bloom: 0, exposure: 1.05, wall: 0xeee2cf, lit: false, stars: false, houses: [0x9fb0d9, 0xb8a7cf, 0xd8b9a5, 0x93b5c9, 0xc7c0dc], ground: 0x8c8fa8, hills: [0x7fa08f, 0x8aa6a0, 0x7896a0] },
  rain: { sky: ["#3c456f", "#8b93b8", "#626c98"], fog: 0x6b739a, hemi: [0xb8c2ec, 0x3a3040, 1.0], key: [0xd9defa, 1.15], rim: [0x8fa8ff, 0.8], bloom: 0.6, exposure: 1.0, wall: 0xd9d0c4, lit: true, stars: false, houses: [0x59618f, 0x6a6797, 0x7c6a92, 0x4d5788, 0x6e74a6], ground: 0x2b2d55, hills: [0x4c5b78, 0x55607e, 0x4a5c74] },
  warm: { sky: ["#f08a5d", "#ffe2b0", "#ffc08a"], fog: 0xffd2a6, hemi: [0xffe3c8, 0x6a4636, 1.0], key: [0xffcf98, 2.3], rim: [0xffb0c8, 0.5], bloom: 0, exposure: 1.06, wall: 0xf1dcc2, lit: false, stars: false, houses: [0xd89a86, 0xe3b08f, 0xc58b9a, 0xe7c19a, 0xb98aa6], ground: 0xa98a86, hills: [0xb98473, 0xc29380, 0xa97a7a] },
  night: { sky: ["#0d1035", "#3d3a74", "#272862"], fog: 0x2a2d63, hemi: [0x8a98ff, 0x2a2238, 0.7], key: [0xbfc8ff, 0.8], rim: [0x8fa8ff, 0.9], bloom: 1.6, exposure: 1.12, wall: 0xb9acb4, lit: true, stars: true, houses: [0x3f4378, 0x4b4884, 0x5a4a80, 0x353d72, 0x4a5090], ground: 0x23254d, hills: [0x2c3a5a, 0x323e66, 0x2a3656] },
  end: { sky: ["#1b1446", "#5b3fa0", "#3a2b7c"], fog: 0x2e2466, hemi: [0xb7a8ff, 0x2a2238, 0.85], key: [0xffe6cc, 1.3], rim: [0xa684ff, 1.1], bloom: 1.2, exposure: 1.1, wall: 0xc9b9c6, lit: true, stars: true, houses: [0x463d86, 0x55488f, 0x5f4b8c, 0x3d3b7c, 0x51509a], ground: 0x272258, hills: [0x33306a, 0x3a3474, 0x2e2c62] },
};

function moodFor(text: string, isEnd: boolean): Mood {
  if (isEnd) return "end";
  if (/rain|drizzle|wet|storm|thunder|soak|drops?|umbrella/.test(text)) return "rain";
  if (/moon|night|star|dark|sleep|bedtime/.test(text)) return "night";
  if (/sun|dry|heat|hot|summer|week|noon/.test(text)) return "warm";
  return "day";
}

// ---- The set: wall with a window, sill, curtains, the street outside ------------------

const WX = 1.6, WB = 0.8, WT = 4.75, WZ = -2.35;

function room(mood: Mood, seed: number): Kit {
  const m = MOODS[mood];
  const g = new THREE.Group();
  const WALL = m.wall, FRAME = 0x7a5436, SILL = 0xcaa67a;
  // Wall around the window opening.
  g.add(at(rbox(9, 16, 0.4, WALL, 0.02), -WX - 4.5, 3, WZ));
  g.add(at(rbox(9, 16, 0.4, WALL, 0.02), WX + 4.5, 3, WZ));
  g.add(at(rbox(2 * WX, 6, 0.4, WALL, 0.02), 0, WT + 3, WZ));
  g.add(at(rbox(2 * WX, 6, 0.4, WALL, 0.02), 0, WB - 3, WZ));
  // Frame and one cross bar.
  for (const [w, h, x, y] of [[0.3, WT - WB + 0.3, -WX, (WT + WB) / 2], [0.3, WT - WB + 0.3, WX, (WT + WB) / 2], [2 * WX + 0.3, 0.3, 0, WT], [2 * WX + 0.3, 0.3, 0, WB]])
    g.add(at(rbox(w, h, 0.45, FRAME, 0.05, { roughness: 0.6 }), x, y, WZ + 0.05));
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(2 * WX, WT - WB), new THREE.MeshPhysicalMaterial({ color: 0xc8d4ff, transparent: true, opacity: 0.08, roughness: 0.05, depthWrite: false }));
  glass.position.set(0, (WT + WB) / 2, WZ + 0.2); g.add(glass);
  // The sill and its lip; top surface at y = 0.
  g.add(at(rbox(7.5, 0.5, 3.2, SILL, 0.08, { roughness: 0.7 }), 0, -0.25, -0.85));
  g.add(at(rbox(7.6, 0.24, 0.3, 0xb48f64, 0.06), 0, -0.44, 0.75));

  // Curtains: soft cloth that breathes.
  const curtains: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const geo = new THREE.PlaneGeometry(0.95, 4.9, 14, 30);
    const c = new THREE.Mesh(geo, mat(mood === "night" || mood === "end" ? 0x8f86c9 : 0xe6d6f2, { side: THREE.DoubleSide, roughness: 0.92 }));
    c.position.set(side * (WX + 0.12), 2.7, WZ + 0.42); c.castShadow = true; c.receiveShadow = true;
    c.userData.base = (geo.attributes.position.array as Float32Array).slice();
    c.userData.side = side; g.add(c); curtains.push(c);
  }

  // Outside: far sky, hills, a street of rounded houses with lit windows.
  const out = new THREE.Group(); g.add(out);
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(160, 90), new THREE.MeshBasicMaterial({ map: gradientTexture(...m.sky), fog: false, depthWrite: false }));
  sky.position.set(0, 9, -48); out.add(sky);
  ([[-14, -9, -34, 13], [10, -10, -38, 15], [0, -11, -30, 11]] as const).forEach(([x, y, z, r], i) => {
    const hill = ball(r, m.hills[i], { roughness: 0.95 }); hill.scale.y = 0.55; hill.castShadow = false; out.add(at(hill, x, y, z));
  });
  out.add(at(rbox(80, 0.3, 50, m.ground, 0.02), 0, -4, -26));
  const q = rng(seed * 7 + 3);
  const lights: { material: THREE.Material & { opacity: number } }[] = [];
  for (let i = 0; i < 14; i++) {
    const x = -13 + i * 2 + q() * 1.1, z = -9 - q() * 12, w = 1.5 + q() * 1.3, h = 2.4 + q() * 5, d = 1.5 + q();
    out.add(at(rbox(w, h, d, m.houses[i % m.houses.length], 0.12), x, -4 + h / 2, z));
    // A gable roof from two rounded slabs.
    for (const s of [-1, 1]) {
      const slab = rbox(w * 0.62, 0.14, d + 0.25, 0x4a4570, 0.05); slab.position.set(x + s * w * 0.24, -4 + h + w * 0.17, z); slab.rotation.z = -s * 0.62; out.add(slab);
    }
    for (let j = 0; j < 3; j++) for (let k = 0; k < 2; k++) if (q() > 0.4) {
      const wy = -4 + h - 0.8 - j * 1.1; if (wy < -3.4) continue;
      const wm = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.4), new THREE.MeshBasicMaterial({ color: m.lit ? 0xffd98a : 0xdfe8ff }));
      wm.position.set(x - w / 2 + 0.45 + k * (w - 0.9), wy, z + d / 2 + 0.02); out.add(wm);
      if (m.lit && q() > 0.6) { const gl = glow(0.9, "rgba(255,214,140,0.9)", 0.5); gl.position.copy(wm.position); gl.position.z += 0.05; out.add(gl); lights.push(gl); }
    }
  }
  if (m.stars) {
    const pts: number[] = []; for (let i = 0; i < 260; i++) pts.push((q() - 0.5) * 70, 2 + q() * 26, -40 - q() * 4);
    const stars = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)),
      new THREE.PointsMaterial({ size: 0.28, map: glowTexture("rgba(255,255,255,1)"), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    out.add(stars); lights.push(stars);
  }

  // A few soft clouds drift by on clear days.
  const drift: THREE.Group[] = [];
  if (mood === "day" || mood === "warm") for (const [cx, cy, cz, cs] of [[-2.2, 5.6, -14, 1.3], [2.6, 4.2, -16, 1.0], [0.4, 7.2, -18, 1.5]] as const) {
    const c = cloudPuffs(mood === "warm" ? 0xffe7d2 : 0xf9f8ff, Math.round(cx * 10 + 50)); c.scale.setScalar(cs); c.position.set(cx, cy, cz); c.userData.x = cx; out.add(c); drift.push(c);
  }

  // Dust in the light on bright days.
  let motes: THREE.Points | null = null;
  if (mood === "day" || mood === "warm") {
    const pts: number[] = []; for (let i = 0; i < 70; i++) pts.push((q() - 0.5) * 3.6, q() * 3.2, -1.6 + q() * 2.6);
    motes = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)),
      new THREE.PointsMaterial({ size: 0.035, map: glowTexture("rgba(255,246,220,1)"), transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(motes);
  }

  return { group: g, update: (t) => {
    curtains.forEach((c) => {
      const p = c.geometry.attributes.position as THREE.BufferAttribute, base = c.userData.base as Float32Array;
      for (let i = 0; i < p.count; i++) {
        const bx = base[i * 3], by = base[i * 3 + 1];
        const fold = Math.sin(bx * 11 + c.userData.side) * 0.07;
        const sway = Math.sin(t * 0.9 + by * 0.8) * 0.05 * (0.5 - by / 4.9);
        p.setXYZ(i, bx + sway * 0.6 * c.userData.side, by, fold + sway);
      }
      p.needsUpdate = true; c.geometry.computeVertexNormals();
    });
    lights.forEach((l, i) => { l.material.opacity = (l instanceof THREE.Points ? 0.85 : 0.42) + Math.sin(t * 1.7 + i) * 0.08; });
    drift.forEach((c, i) => { c.position.x = c.userData.x + Math.sin(t * 0.08 + i) * 0.6 + t * 0.05; });
    if (motes) { motes.rotation.y = Math.sin(t * 0.15) * 0.1; motes.position.y = Math.sin(t * 0.4) * 0.06; }
  } };
}

// ---- Kits on the sill ------------------------------------------------------------

function pot(color: number) {
  const g = new THREE.Group();
  const prof = [[0, 0], [0.22, 0], [0.25, 0.03], [0.29, 0.38], [0.34, 0.4], [0.35, 0.49], [0.32, 0.51], [0.3, 0.46]].map(([r, y]) => new THREE.Vector2(r, y));
  g.add(shade(new THREE.Mesh(new THREE.LatheGeometry(prof, 56), mat(color, { roughness: 0.66 }))));
  g.add(at(shade(new THREE.Mesh(new THREE.CylinderGeometry(0.295, 0.295, 0.03, 48), mat(0x4a3426, { roughness: 1 }))), 0, 0.44, 0));
  return g;
}

function leaf(len: number, color: number) {
  const l = ball(1, color, { roughness: 0.6 }); l.scale.set(len, 0.035, len * 0.42); l.position.x = len * 0.9; return l;
}

function plant(x: number, z: number, kind: "leafy" | "bloom" | "moon", seed = 1): Kit {
  const q = rng(seed * 13 + 5);
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = (q() - 0.5) * 0.6;
  const potColor = kind === "moon" ? 0x5a82b8 : [0xc8693f, 0xd98a5f, 0xb9785a][Math.floor(q() * 3)];
  g.add(pot(potColor));
  const stemG = new THREE.Group(); stemG.position.y = 0.45; g.add(stemG);
  const H = kind === "leafy" ? 0.75 : 0.95;
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.04, H * 0.35, 0.02), new THREE.Vector3(-0.03, H * 0.7, 0), new THREE.Vector3(0, H, 0.02)]);
  stemG.add(shade(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.026, 12), mat(0x4c8f4a, { roughness: 0.6 }))));
  const leafColor = kind === "moon" ? 0x4b9a6a : 0x5fae5a;
  const leaves: THREE.Group[] = [];
  const pairs = kind === "leafy" ? 4 : 3;
  for (let i = 0; i < pairs; i++) for (const side of [-1, 1]) {
    const piv = new THREE.Group(); const y = H * (0.22 + i * 0.2);
    piv.position.copy(curve.getPoint(y / H)); piv.rotation.set(0, side > 0 ? 0 : Math.PI, 0.35 + q() * 0.25);
    piv.rotateY((q() - 0.5) * 0.8 + i * 0.9);
    piv.add(leaf(0.16 + (pairs - i) * 0.03, leafColor)); piv.userData.base = piv.rotation.z; piv.userData.ph = q() * 6;
    stemG.add(piv); leaves.push(piv);
  }
  const petals: THREE.Group[] = [];
  let head: THREE.Group | null = null, glowMat: THREE.MeshStandardMaterial | null = null, halo: THREE.Sprite | null = null;
  if (kind !== "leafy") {
    head = new THREE.Group(); head.position.copy(curve.getPoint(1)); stemG.add(head);
    head.add(ball(0.065, kind === "moon" ? 0xf4f1c8 : 0xf2b33d, { roughness: 0.5 }));
    glowMat = mat(kind === "moon" ? 0xfffaf0 : 0xf7a8c0, { roughness: 0.45, emissive: kind === "moon" ? 0xfff0c8 : 0x000000, emissiveIntensity: 0 });
    const n = kind === "moon" ? 6 : 8;
    for (let i = 0; i < n; i++) {
      const piv = new THREE.Group(); piv.rotation.y = (i / n) * Math.PI * 2; head.add(piv);
      const tilt = new THREE.Group(); piv.add(tilt);
      const p = shade(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), glowMat)); p.scale.set(0.13, 0.025, 0.06); p.position.x = 0.12; tilt.add(p);
      petals.push(tilt);
    }
    if (kind === "moon") { halo = glow(0.9, "rgba(255,240,200,1)", 0); head.add(halo); }
  }
  return { group: g, update: (t, k) => {
    stemG.scale.setScalar(0.55 + ease(k * 1.3) * 0.45);
    leaves.forEach((l) => { l.rotation.z = l.userData.base + Math.sin(t * 1.6 + l.userData.ph) * 0.06; });
    if (head) {
      const open = ease((k - 0.3) * 1.8);
      petals.forEach((p) => { p.rotation.z = 1.25 * (1 - open) + 0.08; });
      head.rotation.y = t * 0.25;
      if (glowMat && kind === "moon") glowMat.emissiveIntensity = open * 0.9;
      if (halo) (halo.material as THREE.SpriteMaterial).opacity = open * 0.8;
    }
    g.rotation.z = Math.sin(t * 0.9 + seed) * 0.012;
  } };
}

// A round original critter: soft body, little ears, big eyes. It breathes, blinks and hops.
function critter(x: number, z: number): Kit {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const face = x < 0 ? 0.35 : -0.35;
  const body = new THREE.Group(); g.add(body);
  const BODY = 0x86d3b6;
  const b = ball(0.3, BODY, { roughness: 0.7 }); b.scale.set(1, 0.86, 0.92); b.position.y = 0.27; body.add(b);
  const belly = ball(0.2, 0xd6f2df, { roughness: 0.8 }); belly.scale.set(1, 0.85, 0.4); belly.position.set(0, 0.22, 0.2); body.add(belly);
  for (const s of [-1, 1]) {
    const ear = ball(0.08, BODY); ear.scale.set(1, 1.3, 0.8); ear.position.set(s * 0.17, 0.53, -0.02); ear.rotation.z = -s * 0.4; body.add(ear);
    body.add(at(ball(0.045, 0xf5a3b5), s * 0.2, 0.25, 0.235));
    const foot = ball(0.07, 0x74c2a5); foot.scale.set(1.2, 0.5, 1.4); foot.position.set(s * 0.14, 0.03, 0.12); body.add(foot);
  }
  const eyes: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(s * 0.105, 0.36, 0.235); body.add(e);
    e.add(ball(0.07, 0xffffff, { roughness: 0.25 }));
    e.add(at(ball(0.042, 0x1b1712, { roughness: 0.2 }), 0, -0.005, 0.04));
    e.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.013, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff })), 0.015, 0.02, 0.078));
    eyes.push(e);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 8, 24, Math.PI), mat(0x2a1d17)); mouth.position.set(0, 0.29, 0.272); mouth.rotation.z = Math.PI; body.add(mouth);
  return { group: g, update: (t) => {
    const hop = Math.max(0, Math.sin(t * 2.4)), land = Math.max(0, -Math.sin(t * 2.4));
    body.position.y = hop * hop * 0.14;
    body.scale.set(1 + land * 0.06, 1 - land * 0.08 + Math.sin(t * 3) * 0.01, 1 + land * 0.06);
    const blink = (t % 3.1) < 0.12 ? 0.12 : 1;
    eyes.forEach((e) => { e.scale.y = blink; });
    g.rotation.y = face + Math.sin(t * 0.7) * 0.15;
  } };
}

// A small figure on the sill: rounded body, round head, cap of hair, swinging arm.
function person(x: number, z: number, shirt = 0x8e51ff, hair = 0x3b2a22, seed = 1): Kit {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = x < 0 ? 0.4 : -0.4;
  for (const s of [-1, 1]) g.add(at(pill(0.055, 0.16, 0x2f3150), s * 0.08, 0.13, 0));
  g.add(at(pill(0.16, 0.22, shirt, { roughness: 0.85 }), 0, 0.44, 0));
  const headG = new THREE.Group(); headG.position.y = 0.82; g.add(headG);
  headG.add(ball(0.19, 0xf2c7a5, { roughness: 0.7 }));
  const cap = shade(new THREE.Mesh(new THREE.SphereGeometry(0.2, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.52), mat(hair, { roughness: 0.9 })));
  cap.rotation.x = -0.25; cap.position.y = 0.015; headG.add(cap);
  for (const s of [-1, 1]) {
    headG.add(at(ball(0.022, 0x1b1712, { roughness: 0.2 }), s * 0.065, 0.0, 0.175));
    headG.add(at(ball(0.03, 0xf3a2a2), s * 0.11, -0.05, 0.15));
  }
  const arms: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const piv = new THREE.Group(); piv.position.set(s * 0.19, 0.58, 0); g.add(piv);
    const a = pill(0.048, 0.2, shirt, { roughness: 0.85 }); a.position.y = -0.14; piv.add(a);
    piv.add(at(ball(0.05, 0xf2c7a5), 0, -0.29, 0)); piv.rotation.z = s * 0.2; arms.push(piv);
  }
  return { group: g, update: (t) => {
    g.position.y = Math.abs(Math.sin(t * 2.2 + seed)) * 0.025;
    headG.rotation.z = Math.sin(t * 1.3 + seed) * 0.08; headG.rotation.y = Math.sin(t * 0.8 + seed) * 0.15;
    arms[1].rotation.z = 0.2 + Math.max(0, Math.sin(t * 3 + seed)) * 0.9; arms[0].rotation.z = -0.2 - Math.sin(t * 1.5) * 0.08;
  } };
}

function phone(x: number, z: number, appName: string, line: string): Kit {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const inner = new THREE.Group(); inner.position.y = 0.64; inner.rotation.x = -0.2; g.add(inner);
  inner.add(rbox(0.66, 1.26, 0.07, mat(0x1c1a2e, { roughness: 0.3, metalness: 0.35 }), 0.1));
  const tex = textCanvas(512, 1000, (x) => {
    const gr = x.createLinearGradient(0, 0, 0, 1000); gr.addColorStop(0, "#3a2a8a"); gr.addColorStop(1, "#8e51ff");
    x.fillStyle = gr; x.beginPath(); x.roundRect(0, 0, 512, 1000, 56); x.fill();
    x.fillStyle = "rgba(255,255,255,0.18)"; x.beginPath(); x.roundRect(186, 26, 140, 30, 15); x.fill();
    x.fillStyle = "#fff"; x.textAlign = "center"; x.font = `800 62px ${FONT}`; x.fillText(appName, 256, 190);
    x.font = `600 40px ${FONT}`; wrapText(line, 18).forEach((l, i) => x.fillText(l, 256, 290 + i * 52));
    for (let i = 0; i < 3; i++) { x.fillStyle = "rgba(255,255,255,0.16)"; x.beginPath(); x.roundRect(48, 520 + i * 130, 416, 104, 28); x.fill(); x.fillStyle = "rgba(255,255,255,0.55)"; x.beginPath(); x.arc(110, 572 + i * 130, 26, 0, Math.PI * 2); x.fill(); x.fillRect(160, 556 + i * 130, 220 - i * 40, 16); }
  });
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.18), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  scr.position.z = 0.037; inner.add(scr);
  const screenGlow = new THREE.PointLight(0xa684ff, 0.6, 2.2, 2); screenGlow.position.set(0, 0, 0.4); inner.add(screenGlow);
  g.add(at(rbox(0.5, 0.06, 0.34, 0x2e2a46, 0.03), 0, 0.03, -0.02));
  return { group: g, update: (t, k) => {
    inner.position.y = 0.64 + Math.sin(t * 1.4) * 0.025 - (1 - spring(k * 3)) * 0.3;
    inner.rotation.y = Math.sin(t * 0.8) * 0.12;
  } };
}

function card(text: string): Kit {
  const g = new THREE.Group(); g.position.set(0, 0, -0.15);
  const inner = new THREE.Group(); inner.position.y = 0.78; g.add(inner);
  inner.add(rbox(1.9, 1.12, 0.06, 0xfbf6ec, 0.08));
  const lines = wrapText(text, 18);
  const tex = textCanvas(1024, 600, (x) => {
    x.fillStyle = "#fbf6ec"; x.fillRect(0, 0, 1024, 600);
    x.fillStyle = "#8e51ff"; x.beginPath(); x.roundRect(60, 60, 160, 16, 8); x.fill();
    x.fillStyle = "#16112b"; x.textAlign = "left"; x.textBaseline = "middle"; x.font = `800 86px ${FONT}`;
    lines.forEach((l, i) => x.fillText(l, 60, 200 + i * 104));
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.78, 1.04), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  face.position.z = 0.032; face.receiveShadow = true; inner.add(face);
  for (const s of [-1, 1]) { const leg = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.62, 16), mat(0x7a5436))); leg.position.set(s * 0.6, 0.3, -0.12); leg.rotation.x = 0.18; g.add(leg); }
  return { group: g, update: (t, k) => { inner.scale.setScalar(0.55 + spring(k * 2.6) * 0.45); inner.rotation.z = (1 - Math.min(1, k * 3)) * 0.18 + Math.sin(t * 1.1) * 0.01; } };
}

function count(n: string): Kit {
  const g = new THREE.Group(); g.position.set(0, 0, -0.2);
  const inner = new THREE.Group(); inner.position.y = 0.72; g.add(inner);
  inner.add(rbox(1.0, 1.0, 0.22, 0x8e51ff, 0.16, { roughness: 0.5 }));
  const tex = textCanvas(512, 512, (x) => { x.fillStyle = "#8e51ff"; x.fillRect(0, 0, 512, 512); x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle"; x.font = `900 380px ${FONT}`; x.fillText(n, 256, 276); });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.86, 0.86), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
  face.position.z = 0.112; inner.add(face);
  return { group: g, update: (t, k) => { inner.rotation.y = (1 - ease(k * 2.5)) * Math.PI + Math.sin(t) * 0.05; inner.position.y = 0.72 + Math.sin(t * 2) * 0.03; } };
}

// Weather and sky things, seen through the window.
function cloudPuffs(color = 0xf6f4ff, seed = 2) {
  const g = new THREE.Group(); const q = rng(seed);
  for (const [x, y, z, s] of [[0, 0, 0, 0.62], [-0.55, -0.1, 0.1, 0.48], [0.58, -0.12, 0.05, 0.5], [0.22, 0.25, -0.05, 0.46], [-0.28, 0.2, 0.02, 0.4], [0.95, -0.2, -0.05, 0.34], [-0.95, -0.2, 0, 0.34]]) {
    const p = ball(s * (0.9 + q() * 0.2), color, { roughness: 0.95 }); p.position.set(x, y, z); p.castShadow = false; g.add(p);
  }
  return g;
}

function cloud(): Kit {
  const g = new THREE.Group();
  const c = cloudPuffs(0xf8f6ff, 5); c.scale.setScalar(1.6); g.add(c);
  const c2 = cloudPuffs(0xeceaff, 9); c2.scale.setScalar(1.1); c2.position.set(3.2, -0.8, -3); g.add(c2);
  g.position.set(-3, 4.2, -9);
  return { group: g, update: (t, k) => { g.position.x = -3 + ease(k * 1.2) * 3.4; c.scale.y = 1.6 * (1 + Math.sin(t * 1.2) * 0.02); } };
}

function rain(): Kit {
  const g = new THREE.Group();
  const cl = cloudPuffs(0xdfe2f4, 7); cl.scale.setScalar(0.75); cl.position.set(0.2, 2.55, -0.8); g.add(cl);
  const n = 170, m = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.012, 0.16, 4, 8), new THREE.MeshStandardMaterial({ color: 0xcfe0ff, roughness: 0.1, transparent: true, opacity: 0.75 }), n);
  const q = rng(17); const seeds = Array.from({ length: n }, () => [(q() - 0.5) * 1.9 + 0.2, q(), -0.8 + (q() - 0.5) * 0.8, 3.5 + q() * 1.5]);
  const d = new THREE.Object3D(); g.add(m);
  const sn = 26, splash = new THREE.InstancedMesh(new THREE.TorusGeometry(0.05, 0.008, 6, 20), new THREE.MeshBasicMaterial({ color: 0xe4ecff, transparent: true, opacity: 0.5 }), sn);
  const sSeeds = Array.from({ length: sn }, () => [(q() - 0.5) * 1.8 + 0.2, -0.8 + (q() - 0.5) * 0.8, q()]); g.add(splash);
  // Streaks outside the glass.
  const on = 260, outR = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.02, 0.45, 3, 6), new THREE.MeshBasicMaterial({ color: 0xbfd0ff, transparent: true, opacity: 0.45 }), on);
  const oSeeds = Array.from({ length: on }, () => [(q() - 0.5) * 14, q() * 12, -4 - q() * 10]); g.add(outR);
  return { group: g, update: (t) => {
    seeds.forEach(([x, y0, z, sp], i) => { const y = 2.35 - ((y0 * 2.35 + t * sp) % 2.35); d.position.set(x, y, z); d.rotation.set(0, 0, 0); d.scale.setScalar(1); d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
    m.instanceMatrix.needsUpdate = true;
    sSeeds.forEach(([x, z, ph], i) => { const p = (t * 1.6 + ph) % 1; d.position.set(x, 0.01, z); d.rotation.set(Math.PI / 2, 0, 0); d.scale.setScalar(0.3 + p * 1.4); d.updateMatrix(); splash.setMatrixAt(i, d.matrix); });
    splash.instanceMatrix.needsUpdate = true;
    oSeeds.forEach(([x, y0, z], i) => { const y = 8 - ((y0 + t * 9) % 12); d.position.set(x, y, z); d.rotation.set(0, 0, 0.08); d.scale.setScalar(1); d.updateMatrix(); outR.setMatrixAt(i, d.matrix); });
    outR.instanceMatrix.needsUpdate = true;
    cl.position.x = 0.2 + Math.sin(t * 0.5) * 0.08;
  } };
}

function sun(): Kit {
  const g = new THREE.Group(); g.position.set(1.0, 4.9, -11);
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.95, 48, 32), new THREE.MeshBasicMaterial({ color: 0xfff0b8, fog: false, toneMapped: false })));
  const h1 = glow(5.5, "rgba(255,226,150,1)", 0.85), h2 = glow(11, "rgba(255,190,120,1)", 0.35); g.add(h1, h2);
  return { group: g, update: (t) => { h1.scale.setScalar(5.5 + Math.sin(t * 1.2) * 0.25); g.position.y = 4.9 + Math.sin(t * 0.3) * 0.05; } };
}

function moon(): Kit {
  const g = new THREE.Group(); g.position.set(-1.0, 4.9, -11);
  g.add(new THREE.Mesh(new THREE.SphereGeometry(0.85, 48, 32), new THREE.MeshStandardMaterial({ color: 0xfff6dc, emissive: 0xfff0cc, emissiveIntensity: 1.1, roughness: 0.9, fog: false })));
  const h = glow(5, "rgba(210,220,255,1)", 0.6); g.add(h);
  return { group: g, update: (t) => { h.scale.setScalar(5 + Math.sin(t * 0.9) * 0.2); g.position.y = 4.9 + Math.sin(t * 0.4) * 0.05; } };
}

function street(): Kit {
  const g = new THREE.Group(); g.position.set(0, 0, -6.5);
  const lamps: THREE.Sprite[] = [];
  for (let i = 0; i < 4; i++) {
    const x = -4.5 + i * 3;
    g.add(at(shade(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 4.2, 16), mat(0x2f2a44))), x, -1.9, 0));
    g.add(at(ball(0.16, mat(0xffe7b0, { emissive: 0xffd98a, emissiveIntensity: 1.5 })), x, 0.25, 0));
    const gl = glow(1.6, "rgba(255,214,140,1)", 0.7); gl.position.set(x, 0.25, 0.05); g.add(gl); lamps.push(gl);
  }
  // A rounded little bus rolling past.
  const bus = new THREE.Group(); bus.add(rbox(1.6, 0.7, 0.7, 0xf2b33d, 0.18));
  for (const s of [-1, 1]) { const wheel = shade(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.72, 24), mat(0x22202e))); wheel.rotation.x = Math.PI / 2; bus.add(at(wheel, s * 0.5, -0.36, 0)); }
  for (let i = 0; i < 3; i++) bus.add(at(new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.22), new THREE.MeshBasicMaterial({ color: 0xfff1c9 })), -0.45 + i * 0.42, 0.12, 0.36));
  bus.position.set(-6, -3.4, 0.8); g.add(bus);
  return { group: g, update: (t, k) => { bus.position.x = -6 + k * 12; bus.position.y = -3.4 + Math.abs(Math.sin(t * 8)) * 0.02; lamps.forEach((l, i) => ((l.material as THREE.SpriteMaterial).opacity = 0.6 + Math.sin(t * 2 + i) * 0.08)); } };
}

function endCard(name: string, cta: string): Kit {
  const g = new THREE.Group(); g.position.set(0, 0, -0.2);
  const inner = new THREE.Group(); inner.position.y = 1.05; g.add(inner);
  inner.add(rbox(1.76, 1.06, 0.12, mat(0x1d1640, { roughness: 0.4 }), 0.14));
  const rest = wrapText(cta.replace(new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[—:-]\\s*`, "i"), ""), 22).slice(0, 2);
  const tex = textCanvas(1024, 616, (x) => {
    const gr = x.createLinearGradient(0, 0, 1024, 616); gr.addColorStop(0, "#241a52"); gr.addColorStop(1, "#4a2fa0");
    x.fillStyle = gr; x.beginPath(); x.roundRect(0, 0, 1024, 616, 60); x.fill();
    x.fillStyle = "#fff"; x.textAlign = "center"; x.textBaseline = "middle"; x.font = `900 132px ${FONT}`; x.fillText(name, 512, 250);
    x.fillStyle = "rgba(255,255,255,0.82)"; x.font = `600 50px ${FONT}`; rest.forEach((l, i) => x.fillText(l, 512, 390 + i * 64));
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.66, 1.0), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  face.position.z = 0.065; inner.add(face);
  const halo = glow(4, "rgba(166,132,255,1)", 0.35); halo.position.z = -0.2; inner.add(halo);
  const sparks: THREE.Sprite[] = [];
  const q = rng(41);
  for (let i = 0; i < 14; i++) { const s = glow(0.12 + q() * 0.1, "rgba(255,240,200,1)", 0.9); s.position.set((q() - 0.5) * 2.8, 0.2 + q() * 1.9, -0.1 + q() * 0.4); s.userData.ph = q() * 6; s.userData.y = s.position.y; g.add(s); sparks.push(s); }
  return { group: g, update: (t, k) => {
    inner.scale.setScalar(0.7 + spring(k * 2.2) * 0.3);
    inner.position.y = 1.05 + Math.sin(t * 1.2) * 0.02;
    sparks.forEach((s) => { s.position.y = s.userData.y + ((t * 0.12 + s.userData.ph) % 0.6); (s.material as THREE.SpriteMaterial).opacity = 0.5 + Math.sin(t * 3 + s.userData.ph) * 0.4; });
  } };
}

// ---- Which kits a beat gets, from its words ------------------------------------------

function kitsFor(label: string, line: string, appName: string, cta: string, isEnd: boolean, seed: number): { kits: Kit[]; mood: Mood } {
  const l = `${label} ${line}`.toLowerCase();
  const mood = moodFor(l, isEnd);
  if (isEnd) return { kits: [endCard(appName, cta), plant(-1.15, -1.1, "bloom", seed), plant(1.15, -1.1, "leafy", seed + 1)], mood };
  const kits: Kit[] = [];
  let onSill = 0;
  // Center pieces first, then the sides fill in around them.
  let center = false;
  const num = l.match(/\b([1-9])\b|\b(one|two|three)\b/);
  if (/countdown|^\s*[1-9]/.test(l) && num) { kits.push(count(num[1] ?? { one: "1", two: "2", three: "3" }[num[2] as "one"])); center = true; onSill++; }
  else if (/myth|fact|card|text|truth|list|tip/.test(l)) { kits.push(card(label)); center = true; onSill++; }
  const slots = center ? [-1.25, 1.25, -1.75, 1.75] : [-0.75, 0.75, 0, -1.4, 1.4];
  const take = () => slots.shift() ?? 0;
  const front = (x: number) => (Math.abs(x) < 0.3 ? 0.15 : -0.35);

  if (mood === "rain") kits.push(rain());
  else if (/cloud|sky|forecast|weather/.test(l)) kits.push(cloud());
  if (mood === "warm") kits.push(sun());
  if (mood === "night") kits.push(moon());
  if (/street|road|city|commute|bus|jeep|outside/.test(l)) kits.push(street());

  if (/phone|app|screen|tap|notification|open|widget/.test(l) && !center) { const x = slots.splice(2, 1)[0] ?? 0; kits.push(phone(x, 0.1, appName, label)); onSill++; }
  if (/vs|argu|says no|debate|explains|auntie|tita|two|couple/.test(l)) { const a = take(), b = take(); kits.push(person(a, front(a), 0x8e51ff, 0x3b2a22, 1), person(b, front(b), 0x3aa0c8, 0x1f1a2a, 2)); onSill += 2; }
  else if (/pov|you|panic|worried|cheers|person|me\b|i |forgot/.test(l)) { const a = take(); kits.push(person(a, front(a))); onSill++; }
  if (/frog|critter|pet|cat|bird|visitor|friend/.test(l)) { const a = take(); kits.push(critter(a, front(a) + 0.1)); onSill++; }
  const plantish = /plant|pot|sprout|garden|bloom|flower|grow|green|sill|water|dry|dies|alive|rain/.test(l);
  const bloom: "leafy" | "bloom" | "moon" = /bloom|flower|open/.test(l) ? (mood === "night" ? "moon" : "bloom") : "leafy";
  if (plantish || onSill < 2) {
    const a = take(), b = take();
    kits.push(plant(a, -0.9, bloom, seed), plant(b, -1.0, "leafy", seed + 3)); onSill += 2;
  }
  if (onSill < 3 && slots.length) { const a = take(); kits.push(critter(a, front(a))); }
  return { kits, mood };
}

// ---- Building and lighting one beat's scene -------------------------------------------

type Built = { scene: THREE.Scene; kits: Kit[]; mood: Mood; exposure: number };

function build(label: string, line: string, appName: string, cta: string, isEnd: boolean, seed: number, shadowSize: number): Built {
  const { kits, mood } = kitsFor(label, line, appName, cta, isEnd, seed);
  const m = MOODS[mood];
  const scene = new THREE.Scene();
  scene.background = gradientTexture(m.sky[0], m.sky[1], m.sky[2]);
  scene.fog = new THREE.Fog(m.fog, 16, 52);
  scene.add(new THREE.HemisphereLight(m.hemi[0], m.hemi[1], m.hemi[2]));
  const key = new THREE.DirectionalLight(m.key[0], m.key[1]);
  key.position.set(-3.5, 7.5, 6); key.target.position.set(0, 0.4, -0.6);
  key.castShadow = true; key.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 5, bottom: -2.5, near: 0.5, far: 30 });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.radius = 6; key.shadow.bias = -0.0005; key.shadow.normalBias = 0.02;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(m.rim[0], m.rim[1]); rim.position.set(3, 5, -12); scene.add(rim);
  // Light spilling in through the window onto the sill.
  const spill = new THREE.PointLight(mood === "warm" ? 0xffc890 : 0xdfe6ff, mood === "night" ? 0.4 : 1.4, 7, 1.6); spill.position.set(0.6, 3.6, -1.6); scene.add(spill);
  if (m.bloom) { const b = new THREE.PointLight(0xfff0d0, m.bloom, 5, 1.8); b.position.set(0, 1.4, 0.6); scene.add(b); }
  const set = room(mood, seed);
  scene.add(set.group);
  kits.forEach((k) => scene.add(k.group));
  return { scene, kits: [set, ...kits], mood, exposure: m.exposure };
}

function dispose(scene: THREE.Scene) {
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    mats.forEach((mt) => { (mt as THREE.MeshStandardMaterial).map?.dispose(); mt.dispose(); });
  });
  (scene.background as THREE.Texture | null)?.dispose?.();
}

function makeRenderer(w: number, h: number) {
  const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  r.setPixelRatio(1); r.setSize(w, h, false);
  r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
  r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
  r.outputColorSpace = THREE.SRGBColorSpace;
  return r;
}

// Camera angles framing the sill; each beat pushes in slowly, cuts change the angle.
const ANGLES: [number, number, number, number, number, number][] = [
  [0, 1.75, 5.6, 0, 1.55, -0.6],
  [1.5, 1.4, 4.6, 0.25, 1.3, -0.7],
  [-1.4, 1.25, 4.3, -0.25, 1.25, -0.7],
  [0, 2.8, 5.2, 0, 1.3, -0.8],
];
function placeCamera(cam: THREE.PerspectiveCamera, angle: number, k: number, t: number, end: boolean) {
  if (end) { cam.position.set(Math.sin(t * 0.4) * 0.12, 1.6, 5.6 - k * 0.4); cam.lookAt(0, 1.35, -0.4); return; }
  const [px, py, pz, tx, ty, tz] = ANGLES[angle % ANGLES.length];
  const push = ease(k) * 0.14;
  cam.position.set(px + (tx - px) * push + Math.sin(t * 0.7) * 0.03, py + (ty - py) * push + Math.sin(t * 0.9) * 0.02, pz + (tz - pz) * push);
  cam.lookAt(tx, ty, tz);
}

// ---- Captions on the output frame -----------------------------------------

function drawCaption(x: CanvasRenderingContext2D, look: CaptionLook, words: string[], shown: number, hook: boolean) {
  const text = words.slice(0, Math.max(1, shown));
  x.textBaseline = "middle";
  if (look === "bold") {
    x.font = "800 64px Archivo, Arial, sans-serif"; x.textAlign = "center";
    const lines = wrapText(text.join(" "), 16);
    lines.forEach((l, i) => { const y = BASE_H * 0.7 + i * 74; x.lineWidth = 10; x.strokeStyle = "#16112b"; x.strokeText(l.toUpperCase(), BASE_W / 2, y); x.fillStyle = i === lines.length - 1 ? "#ffd34d" : "#ffffff"; x.fillText(l.toUpperCase(), BASE_W / 2, y); });
  } else if (look === "lower") {
    x.font = "600 38px 'Public Sans', Arial, sans-serif"; x.textAlign = "left";
    const lines = wrapText(text.join(" "), 28);
    const h = 40 + lines.length * 46; x.fillStyle = "rgba(22,17,43,0.86)"; x.fillRect(0, BASE_H - 220 - h, BASE_W, h);
    x.fillStyle = "#8e51ff"; x.fillRect(0, BASE_H - 220 - h, 10, h);
    x.fillStyle = "#ffffff"; lines.forEach((l, i) => x.fillText(l, 40, BASE_H - 220 - h + 40 + i * 46));
  } else {
    x.font = `${hook ? 46 : 40}px 'Patrick Hand SC', 'Comic Neue', cursive`; x.textAlign = "center";
    const lines = wrapText(text.join(" "), 22);
    const w = Math.max(...lines.map((l) => x.measureText(l).width)) + 60, h = lines.length * 52 + 28;
    const bx = (BASE_W - w) / 2, by = BASE_H * 0.68 - h / 2;
    x.fillStyle = "#ffffff"; x.strokeStyle = "#16112b"; x.lineWidth = 4;
    x.beginPath(); x.roundRect(bx, by, w, h, h / 2); x.fill(); x.stroke();
    x.fillStyle = "#16112b"; lines.forEach((l, i) => x.fillText(l, BASE_W / 2, by + 14 + 26 + i * 52));
  }
}

async function loadFonts() {
  await Promise.all([
    "64px 'Patrick Hand SC'", "800 64px Archivo", "600 38px 'Public Sans'", "800 64px 'Inter Tight'", "900 64px 'Inter Tight'",
  ].map((f) => document.fonts.load(f).catch(() => null)));
}

// A soft vignette over the frame, as in the studio's reels.
function vignette(x: CanvasRenderingContext2D, w: number, h: number) {
  const v = x.createRadialGradient(w / 2, h * 0.47, h * 0.33, w / 2, h / 2, h * 0.72);
  v.addColorStop(0, "rgba(10,8,30,0)"); v.addColorStop(1, "rgba(10,8,30,0.38)");
  x.fillStyle = v; x.fillRect(0, 0, w, h);
}

const endish = (label: string) => /end card|logo|cta/i.test(label);

// ---- One still frame (used by slideshows) --------------------------------------------

let stillRenderer: THREE.WebGLRenderer | null = null;

export async function renderStill(o: { label: string; line: string; appName: string; cta: string; width: number; height: number; isEnd?: boolean }): Promise<HTMLCanvasElement> {
  await loadFonts();
  if (!stillRenderer) stillRenderer = makeRenderer(o.width, o.height);
  const r = stillRenderer;
  r.setSize(o.width, o.height, false);
  const isEnd = o.isEnd ?? endish(o.label);
  const seed = ([...o.label].reduce((a, c) => a + c.charCodeAt(0), 0) % 97) + 1;
  const b = build(o.label, o.line, o.appName, o.cta, isEnd, seed, 2048);
  r.toneMappingExposure = b.exposure;
  const cam = new THREE.PerspectiveCamera(50, o.width / o.height, 0.1, 120);
  const t = 1.2;
  b.kits.forEach((k) => k.update(t, 0.7));
  placeCamera(cam, seed % ANGLES.length, 0.7, t, isEnd);
  r.render(b.scene, cam);
  const out = document.createElement("canvas"); out.width = o.width; out.height = o.height;
  const ox = out.getContext("2d")!;
  ox.drawImage(r.domElement, 0, 0); vignette(ox, o.width, o.height);
  dispose(b.scene);
  return out;
}

// ---- Recording -------------------------------------------------------------

export async function recordScene(o: {
  beats: Beat[]; lines: string[]; secs: number[]; appName: string; cta: string; look: Look;
  onProgress: (shown: number, total: number) => void;
}): Promise<Blob> {
  await loadFonts();
  const ends = o.beats.map((b, i) => i === o.beats.length - 1 && endish(b.label));
  const makeScenes = (shadow: number) => o.beats.map((b, i) => build(b.label, o.lines[i] ?? "", o.appName, o.cta, ends[i], i + 1, shadow));

  // Full 1080×1920 when this machine keeps up; otherwise 720×1280 with lighter shadows.
  let W = 1080, H = 1920;
  let renderer = makeRenderer(W, H);
  let scenes = makeScenes(2048);
  let cam = new THREE.PerspectiveCamera(50, W / H, 0.1, 120);
  {
    const t0 = performance.now();
    for (let f = 0; f < 6; f++) { scenes[0].kits.forEach((k) => k.update(f / 30, 0)); placeCamera(cam, 0, 0, f / 30, ends[0]); renderer.render(scenes[0].scene, cam); }
    renderer.getContext().finish();
    if ((performance.now() - t0) / 6 > 34) {
      scenes.forEach((s) => dispose(s.scene)); renderer.dispose();
      W = 720; H = 1280;
      renderer = makeRenderer(W, H); scenes = makeScenes(1024);
      cam = new THREE.PerspectiveCamera(50, W / H, 0.1, 120);
    }
  }
  const out = document.createElement("canvas"); out.width = W; out.height = H;
  const x = out.getContext("2d")!;
  const S = W / BASE_W;

  const total = o.secs.reduce((a, b) => a + b, 0);
  const stream = out.captureStream(30);
  const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: W > 720 ? 12_000_000 : 6_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise<void>((r) => { rec.onstop = () => r(); });
  rec.start(250);

  const starts = o.secs.map((_, i) => o.secs.slice(0, i).reduce((a, b) => a + b, 0));
  const clock = visibleClock(rec);
  await new Promise<void>((resolve) => {
    const frame = () => {
      const t = clock.now();
      if (t >= total) { resolve(); return; }
      let i = starts.findIndex((s, k) => t >= s && t < s + o.secs[k]); if (i < 0) i = o.secs.length - 1;
      const local = t - starts[i], k = local / o.secs[i];
      const b = scenes[i];
      b.kits.forEach((kit) => kit.update(t, k));
      renderer.toneMappingExposure = b.exposure;
      // One slow push per beat, or a new angle at the reference's cut rhythm.
      const shot = o.look.cutEvery ? Math.floor(local / o.look.cutEvery) : 0;
      placeCamera(cam, i + shot, o.look.cutEvery ? (local % o.look.cutEvery) / o.look.cutEvery : k, t, ends[i]);
      renderer.render(b.scene, cam);
      x.drawImage(renderer.domElement, 0, 0); vignette(x, W, H);
      const words = (o.lines[i] ?? o.beats[i].label).split(/\s+/);
      x.save(); x.scale(S, S);
      drawCaption(x, o.look.captions, words, Math.ceil((local / Math.max(0.6, o.secs[i] * 0.75)) * words.length), i === 0);
      x.fillStyle = "rgba(255,255,255,0.6)"; x.font = "600 16px Archivo, sans-serif"; x.textAlign = "left"; x.textBaseline = "middle"; x.fillText("Distro draft", 22, 36);
      x.restore();
      o.onProgress(Math.min(t, total), total);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  clock.stop(); rec.stop(); await done;
  scenes.forEach((s) => dispose(s.scene));
  renderer.dispose();
  return new Blob(chunks, { type: "video/webm" });
}
