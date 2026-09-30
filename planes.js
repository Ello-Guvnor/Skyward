import * as THREE from 'three';

const G = 9.81;
export const TYPES = [
  { id: 'biplane', short: 'Biplane', name: 'Sopwith Camel', era: 'WWI · 1917', role: 'Slow and nimble, open cockpit',
    vr: 24, vmax: 55, thrust: 4.5, pitch: 0.95, roll: 1.9, gLim: 4.5, half: 4.4, nose: 3.4, cam: [3.2, 11], cockpit: [0, 0.95, 0.35],
    fire: 0.14, ball: 60, bombs: 6, enemy: { name: 'Fokker triplane', speed: 42 } },
  { id: 'spitfire', short: 'Spitfire', name: 'Supermarine Spitfire', era: 'WWII · 1940', role: 'The classic dogfighter',
    vr: 45, vmax: 165, thrust: 10, pitch: 0.85, roll: 2.5, gLim: 6, half: 5.6, nose: 4.6, cam: [4.2, 15], cockpit: [0, 0.85, -0.25],
    fire: 0.09, ball: 90, bombs: 8, enemy: { name: 'Messerschmitt Bf 109', speed: 130 } },
  { id: 'harrier', short: 'Harrier', name: 'Harrier Jump Jet', era: 'Cold War · 1969', role: 'VTOL: press V to hover',
    vr: 62, vmax: 300, thrust: 14, pitch: 0.85, roll: 2.8, gLim: 7, half: 4.7, nose: 7.6, cam: [5, 20], cockpit: [0, 1.2, -3.1],
    fire: 0.08, ball: 120, bombs: 12, vtol: true, enemy: { name: 'MiG-21', speed: 220 } },
  { id: 'f15', short: 'F-15 Eagle', name: 'F-15 Eagle', era: 'Modern · 1976', role: 'Blistering speed and climb',
    vr: 75, vmax: 430, thrust: 17, pitch: 0.95, roll: 3.6, gLim: 9, half: 6.5, nose: 10.6, cam: [6, 28], cockpit: [0, 1.4, -5.2],
    fire: 0.06, ball: 150, bombs: 10, enemy: { name: 'MiG-29', speed: 330 } },
  { id: 'a10', short: 'A-10 Warthog', name: 'A-10 Warthog', era: 'Modern · 1977', role: 'Tank buster, huge bomb load',
    vr: 55, vmax: 200, thrust: 6.5, pitch: 0.7, roll: 1.8, gLim: 6, half: 8.8, nose: 8.1, cam: [6, 28], cockpit: [0, 1.35, -4.1],
    fire: 0.04, ball: 120, bombs: 16, enemy: { name: 'Su-25', speed: 170 } },
];
for (const t of TYPES) { t.LK = G / (1.3 * t.vr * t.vr); t.DK = t.thrust / (0.024 * t.vmax * t.vmax); }

let nameTex = null;
function nameTexture() {
  if (nameTex) return nameTex;
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
  const txt = 'C. PRICE'; let fs = 96; g.font = `italic 900 ${fs}px system-ui, sans-serif`;
  while (g.measureText(txt).width > 470 && fs > 40) { fs -= 4; g.font = `italic 900 ${fs}px system-ui, sans-serif`; }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = '#1a1a1a'; g.strokeText(txt, 256, 68);
  g.fillStyle = '#d8392b'; g.fillText(txt, 256, 68);
  nameTex = new THREE.CanvasTexture(c); nameTex.colorSpace = THREE.SRGBColorSpace; nameTex.anisotropy = 8; return nameTex;
}

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, ...o });
const DARK = mat(0x24282e, { roughness: 0.7 }), METAL = mat(0x8a8f96, { metalness: 0.6, roughness: 0.4 });
const GLASS = new THREE.MeshPhongMaterial({ color: 0x1b2e40, specular: 0xbbddff, shininess: 140, transparent: true, opacity: 0.5 });
const SKIN = mat(0xc68a5e, { roughness: 0.7 });
const FLAME = new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
const NAME = () => new THREE.MeshStandardMaterial({ map: nameTexture(), transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });

function flatWing(pts, t) {
  const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
  sh.closePath();
  const geo = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: false });
  geo.rotateX(Math.PI / 2); geo.translate(0, t / 2, 0); geo.computeVertexNormals(); return geo;
}
function starShape(r) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, rr = i % 2 ? r * 0.4 : r; const x = Math.sin(a) * rr, y = Math.cos(a) * rr; i ? s.lineTo(x, y) : s.moveTo(x, y); }
  s.closePath(); return new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2);
}
function insignia(kind, r) {
  const g = new THREE.Group();
  const put = (geo, color, y) => { const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, polygonOffset: true, polygonOffsetFactor: -3 })); m.position.y = y; g.add(m); };
  const disc = rad => new THREE.CircleGeometry(rad, 24).rotateX(-Math.PI / 2);
  if (kind === 'raf') { put(disc(r), 0x1f3a8a, 0); put(disc(r * 0.62), 0xffffff, 0.004); put(disc(r * 0.3), 0xc8102e, 0.008); }
  else if (kind === 'usaf') { put(disc(r), 0x1f3a8a, 0); put(starShape(r * 0.95), 0xffffff, 0.004); }
  else if (kind === 'cross') {
    put(new THREE.BoxGeometry(r * 2, 0.01, r * 0.8), 0xffffff, 0); put(new THREE.BoxGeometry(r * 0.8, 0.01, r * 2), 0xffffff, 0.001);
    put(new THREE.BoxGeometry(r * 1.7, 0.01, r * 0.45), 0x111111, 0.004); put(new THREE.BoxGeometry(r * 0.45, 0.01, r * 1.7), 0x111111, 0.005);
  } else { put(starShape(r * 1.12), 0xffffff, 0); put(starShape(r), 0xd01818, 0.004); }
  return g;
}
function pilot(enemy) {
  const helmet = mat(enemy ? 0x1a1a1a : 0x1d6fd6, { roughness: 0.35, metalness: 0.2 });
  const p = new THREE.Group();
  p.add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10), SKIN));
  const hat = new THREE.Mesh(new THREE.SphereGeometry(0.225, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), helmet); hat.position.y = 0.02; p.add(hat);
  const gog = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.08, 0.08), DARK); gog.position.set(0, 0.03, -0.18); p.add(gog);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.28, 0.5, 10), helmet); torso.position.y = -0.4; p.add(torso);
  return p;
}

function kit(enemy) {
  const g = new THREE.Group(), body = [], flames = [], nozzles = [];
  const add = (geo, m, x = 0, y = 0, z = 0, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
  const gear = (pts, top) => {
    const wheel = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 14).rotateZ(Math.PI / 2);
    for (const [x, z] of pts) { add(wheel, DARK, x, -1.26, z); const h = top + 1.26; add(new THREE.BoxGeometry(0.12, h, 0.12), DARK, x, top - h / 2, z); }
  };
  const decals = (y, x, z, w, h, parent = g) => {
    if (enemy) return; const m = NAME();
    for (const sx of [-1, 1]) { const d = new THREE.Mesh(new THREE.PlaneGeometry(w, h).rotateX(-Math.PI / 2), m); d.position.set(sx * x, y, z); parent.add(d); }
  };
  const marks = (kind, y, x, z, r) => { for (const sx of [-1, 1]) { const i = insignia(kind, r); i.position.set(sx * x, y, z); g.add(i); } };
  const cockpit = (y, z) => { const p = pilot(enemy); p.position.set(0, y, z); g.add(p); body.push(p); };
  const flame = (x, y, z, r, len) => { const f = add(new THREE.ConeGeometry(r, len, 12, 1, true).rotateX(Math.PI / 2).translate(0, 0, len / 2), FLAME, x, y, z); f.castShadow = false; flames.push(f); return f; };
  const prop = (z, blades, len, m, discR) => {
    const p = new THREE.Group(); p.position.set(0, 0, z); g.add(p);
    for (let i = 0; i < blades; i++) { const arm = new THREE.Group(); arm.rotation.z = i / blades * Math.PI * 2; p.add(arm); add(new THREE.BoxGeometry(0.2, len, 0.07), m, 0, len / 2, 0, arm); }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(discR, 32), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    disc.position.set(0, 0, z - 0.03); g.add(disc);
    return { prop: p, disc };
  };
  return { g, body, flames, nozzles, add, gear, decals, marks, cockpit, flame, prop };
}

function biplane(enemy) {
  const k = kit(enemy), { add } = k;
  const skin = mat(enemy ? 0xb3221c : 0xc9b27a, { roughness: 0.8, metalness: 0 }), wing = mat(enemy ? 0xa81e18 : 0xbfa86e, { roughness: 0.85, metalness: 0 });
  const trim = mat(enemy ? 0x1a1a1a : 0x7a5a2a, { roughness: 0.7 }), wood = mat(0x6b4423, { roughness: 0.8 });
  k.body.push(add(new THREE.CylinderGeometry(0.42, 0.72, 5.6, 10).rotateX(Math.PI / 2), skin, 0, 0, 0.4));
  k.body.push(add(new THREE.CylinderGeometry(0.76, 0.76, 0.7, 16).rotateX(Math.PI / 2), METAL, 0, 0, -2.6));
  add(new THREE.BoxGeometry(8.4, 0.12, 1.4), wing, 0, -0.45, -1.0);
  add(new THREE.BoxGeometry(8.8, 0.12, 1.45), wing, 0, 1.2, -1.2);
  if (enemy) add(new THREE.BoxGeometry(8.0, 0.12, 1.3), wing, 0, 0.45, -1.1);
  for (const x of [-3.3, 3.3, -1.1, 1.1]) for (const z of [-1.6, -0.7]) add(new THREE.BoxGeometry(0.07, 1.62, 0.07), trim, x, 0.38, z);
  add(new THREE.BoxGeometry(3.0, 0.08, 0.9), wing, 0, 0.1, 3.0);
  add(new THREE.BoxGeometry(0.08, 1.1, 0.95), trim, 0, 0.6, 3.05);
  const { prop, disc } = k.prop(-3.05, 2, 1.35, wood, 1.4);
  k.gear([[0.9, -1.8], [-0.9, -1.8]], -0.5);
  add(new THREE.BoxGeometry(0.08, 0.7, 0.08), trim, 0, -0.55, 3.0);
  k.cockpit(0.5, 0.35);
  k.decals(1.27, 2.2, -1.2, 2.9, 0.95);
  k.marks(enemy ? 'cross' : 'raf', 1.27, 3.7, -1.2, 0.55);
  return { group: k.g, body: k.body, prop, disc, flames: k.flames, nozzles: k.nozzles };
}

function spitfire(enemy) {
  const k = kit(enemy), { add } = k;
  const skin = mat(enemy ? 0x7b8288 : 0x55603a, { roughness: 0.7, metalness: 0.1 }), nose = mat(enemy ? 0xe2b31c : 0x2b2b2b);
  k.body.push(add(new THREE.CylinderGeometry(0.3, 0.72, 8.0, 14).rotateX(Math.PI / 2), skin, 0, 0, 0.5));
  add(new THREE.ConeGeometry(0.5, 1.0, 14).rotateX(-Math.PI / 2), nose, 0, 0, -4.0);
  const pts = [], tr = [];
  for (let i = 0; i <= 16; i++) { const t = -1 + i / 8, x = t * 5.6, c = Math.max(0.3, 2.4 * Math.sqrt(Math.max(0, 1 - t * t))); pts.push([x, -0.9 - c * 0.45]); tr.unshift([x, -0.9 + c * 0.55]); }
  add(flatWing(pts.concat(tr), 0.22), skin, 0, -0.4, 0);
  add(new THREE.BoxGeometry(3.3, 0.08, 1.0), skin, 0, 0.05, 4.1);
  const fin = add(new THREE.BoxGeometry(0.1, 1.5, 1.2), skin, 0, 0.75, 4.2); fin.rotation.x = -0.15;
  const canopy = add(new THREE.SphereGeometry(0.5, 16, 10), GLASS, 0, 0.6, -0.3); canopy.scale.set(1, 0.8, 2.0); k.body.push(canopy);
  add(new THREE.BoxGeometry(0.5, 0.35, 1.2), DARK, 1.6, -0.65, -0.6);
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.12, 0.12, 1.2), DARK, sx * 0.55, 0.2, -2.6);
  const { prop, disc } = k.prop(-4.1, 3, 1.5, DARK, 1.6);
  k.gear([[1.5, -1.3], [-1.5, -1.3]], -0.5);
  k.cockpit(0.45, -0.25);
  k.decals(-0.285, 2.6, -0.9, 2.8, 0.85);
  k.marks(enemy ? 'cross' : 'raf', -0.285, 4.3, -0.9, 0.5);
  return { group: k.g, body: k.body, prop, disc, flames: k.flames, nozzles: k.nozzles };
}

function harrier(enemy) {
  const k = kit(enemy), { add } = k;
  const skin = mat(enemy ? 0xa8b0b8 : 0x5e6b58, { roughness: 0.6, metalness: enemy ? 0.5 : 0.15 });
  k.body.push(add(new THREE.CylinderGeometry(0.55, 0.95, 10, 12).rotateX(Math.PI / 2), skin, 0, 0, 0.8));
  add(new THREE.ConeGeometry(0.95, 3.4, 12).rotateX(-Math.PI / 2), skin, 0, 0, -5.9);
  add(new THREE.ConeGeometry(0.55, 2.0, 12).rotateX(Math.PI / 2), skin, 0, 0, 6.8);
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.72, 0.72, 3.0, 12).rotateX(Math.PI / 2), skin, sx * 1.05, 0.05, -1.8);
    add(new THREE.CircleGeometry(0.6, 16).rotateY(Math.PI), DARK, sx * 1.05, 0.05, -3.32);
    const w = new THREE.Group(); w.position.set(0, 0.85, 0.3); w.rotation.z = -sx * 0.14; k.g.add(w);
    add(flatWing([[sx * 0.3, -1.9], [sx * 4.7, 0.9], [sx * 4.7, 1.7], [sx * 0.3, 1.7]], 0.22), skin, 0, 0, 0, w);
    if (!enemy) { const d = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.62).rotateX(-Math.PI / 2), NAME()); d.position.set(sx * 2.5, 0.115, 0.9); w.add(d); }
    const i = insignia(enemy ? 'star' : 'raf', 0.35); i.position.set(sx * 3.9, 0.115, 1.25); w.add(i);
    const st = new THREE.Group(); st.position.set(0, 0.9, 5.6); st.rotation.z = sx * 0.25; k.g.add(st);
    add(flatWing([[sx * 0.3, -0.4], [sx * 2.4, 0.8], [sx * 2.4, 1.3], [sx * 0.3, 1.2]], 0.14), skin, 0, 0, 0, st);
    for (const z of [-1.2, 0.9]) {
      const n = new THREE.Group(); n.position.set(sx * 1.3, -0.25, z); k.g.add(n); k.nozzles.push(n);
      add(new THREE.BoxGeometry(0.5, 0.5, 1.0).translate(0, 0, 0.5), DARK, 0, 0, 0, n);
      const f = add(new THREE.ConeGeometry(0.22, 2.4, 10, 1, true).rotateX(Math.PI / 2).translate(0, 0, 1.2), FLAME, 0, 0, 1.0, n); f.castShadow = false; k.flames.push(f);
    }
  }
  const fin = add(new THREE.BoxGeometry(0.14, 2.2, 2.0), skin, 0, 1.5, 5.3); fin.rotation.x = -0.45;
  const canopy = add(new THREE.SphereGeometry(0.6, 16, 10), GLASS, 0, 0.85, -3.3); canopy.scale.set(1, 0.85, 2.2); k.body.push(canopy);
  k.gear([[0, -2.0], [0, 2.2], [4.3, 1.3], [-4.3, 1.3]], -0.6);
  k.cockpit(0.75, -3.2);
  return { group: k.g, body: k.body, prop: null, disc: null, flames: k.flames, nozzles: k.nozzles };
}

function f15(enemy) {
  const k = kit(enemy), { add } = k;
  const skin = mat(enemy ? 0x6f7d73 : 0x8e99a3, { roughness: 0.6, metalness: 0.2 });
  k.body.push(add(new THREE.CylinderGeometry(0.85, 1.05, 10, 14).rotateX(Math.PI / 2).scale(1.3, 1, 1), skin, 0, 0, -2));
  add(new THREE.ConeGeometry(0.85, 3.6, 14).rotateX(-Math.PI / 2).scale(1.2, 1, 1), skin, 0, 0, -8.8);
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.68, 0.72, 7, 14).rotateX(Math.PI / 2), skin, sx * 0.85, -0.1, 5.2);
    add(new THREE.CylinderGeometry(0.58, 0.66, 0.9, 14).rotateX(Math.PI / 2), DARK, sx * 0.85, -0.1, 9.1);
    add(new THREE.BoxGeometry(1.0, 1.4, 4), skin, sx * 1.75, -0.15, -1.8);
    add(new THREE.BoxGeometry(0.9, 1.3, 0.05), DARK, sx * 1.75, -0.15, -3.82);
    const fin = add(new THREE.BoxGeometry(0.14, 3.0, 2.5), skin, sx * 1.65, 1.75, 7.8); fin.rotation.set(-0.4, 0, -sx * 0.12);
    k.flame(sx * 0.85, -0.1, 9.55, 0.52, 4);
  }
  add(flatWing([[-6.5, 5.2], [-6.5, 3.7], [-1.3, -1.6], [1.3, -1.6], [6.5, 3.7], [6.5, 5.2], [1.3, 5.6], [-1.3, 5.6]], 0.22), skin, 0, 0.15, 0);
  add(flatWing([[-4.4, 9.8], [-4.4, 8.8], [-1.2, 6.8], [1.2, 6.8], [4.4, 8.8], [4.4, 9.8]], 0.15), skin, 0, 0, 0);
  const canopy = add(new THREE.SphereGeometry(0.72, 16, 10), GLASS, 0, 1.0, -5.4); canopy.scale.set(1, 0.8, 2.5); k.body.push(canopy);
  k.gear([[0, -6.8], [1.6, 1.2], [-1.6, 1.2]], -0.8);
  k.cockpit(0.9, -5.3);
  k.decals(0.265, 3.8, 3.0, 2.8, 0.85);
  k.marks(enemy ? 'star' : 'usaf', 0.265, 5.4, 4.4, 0.5);
  return { group: k.g, body: k.body, prop: null, disc: null, flames: k.flames, nozzles: k.nozzles };
}

function a10(enemy) {
  const k = kit(enemy), { add } = k;
  const skin = mat(enemy ? 0x8c8a62 : 0x5b6660, { roughness: 0.7, metalness: 0.1 });
  k.body.push(add(new THREE.CylinderGeometry(0.72, 0.95, 11, 12).rotateX(Math.PI / 2), skin, 0, 0, -0.4));
  add(new THREE.ConeGeometry(0.95, 2.2, 12).rotateX(-Math.PI / 2), skin, 0, 0, -7.0);
  add(new THREE.CylinderGeometry(0.13, 0.13, 1.6, 8).rotateX(Math.PI / 2), DARK, 0, -0.35, -8.3);
  add(new THREE.ConeGeometry(0.72, 1.2, 12).rotateX(Math.PI / 2), skin, 0, 0, 5.7);
  add(flatWing([[-8.8, 1.3], [-8.8, -0.3], [-1, -1.2], [1, -1.2], [8.8, -0.3], [8.8, 1.3], [1, 1.7], [-1, 1.7]], 0.3), skin, 0, -0.45, 0);
  for (const sx of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.78, 0.78, 3.8, 14).rotateX(Math.PI / 2), skin, sx * 1.55, 1.3, 3.0);
    add(new THREE.CircleGeometry(0.66, 16).rotateY(Math.PI), DARK, sx * 1.55, 1.3, 1.08);
    add(new THREE.BoxGeometry(0.3, 0.6, 1.5), skin, sx * 1.1, 0.8, 3.0);
    add(new THREE.BoxGeometry(0.15, 2.6, 1.6), skin, sx * 3.2, 1.2, 6.2);
    add(new THREE.BoxGeometry(0.6, 0.6, 2.2), skin, sx * 2.4, -0.8, -0.2);
    k.flame(sx * 1.55, 1.3, 4.9, 0.5, 2.2);
  }
  add(new THREE.BoxGeometry(6.4, 0.15, 1.7), skin, 0, 0.5, 6.1);
  const canopy = add(new THREE.SphereGeometry(0.62, 16, 10), GLASS, 0, 0.95, -4.3); canopy.scale.set(1, 0.85, 1.6); k.body.push(canopy);
  k.gear([[0.3, -5.2], [2.4, -0.2], [-2.4, -0.2]], -0.8);
  k.cockpit(0.85, -4.2);
  k.decals(-0.295, 4.6, 0.3, 3.4, 1.0);
  k.marks(enemy ? 'star' : 'usaf', -0.295, 7.3, 0.45, 0.55);
  return { group: k.g, body: k.body, prop: null, disc: null, flames: k.flames, nozzles: k.nozzles };
}

const BUILDERS = { biplane, spitfire, harrier, f15, a10 };
export function buildPlane(type, { enemy = false } = {}) { return BUILDERS[type.id](enemy); }
