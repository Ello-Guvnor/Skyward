import * as THREE from 'three';
import { TYPES, buildPlane } from './planes.js';

// ---------------------------------------------------------------- utils
const V3 = THREE.Vector3;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function makeNoise(seed) {
  const rnd = mulberry32(seed);
  const p = new Uint8Array(256); for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512); for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  return (xin, yin) => {
    const s = (xin + yin) * F2; const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2; const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255; let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0; if (t0 > 0) { const g = grad[perm[ii + perm[jj]] & 7]; t0 *= t0; n += t0 * t0 * (g[0] * x0 + g[1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1; if (t1 > 0) { const g = grad[perm[ii + i1 + perm[jj + j1]] & 7]; t1 *= t1; n += t1 * t1 * (g[0] * x1 + g[1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2; if (t2 > 0) { const g = grad[perm[ii + 1 + perm[jj + 1]] & 7]; t2 *= t2; n += t2 * t2 * (g[0] * x2 + g[1] * y2); }
    return 70 * n;
  };
}
const noiseA = makeNoise(1337), noiseB = makeNoise(4242);
function fbm(n, x, z, oct) { let a = 1, f = 1, sum = 0, norm = 0; for (let i = 0; i < oct; i++) { sum += a * n(x * f, z * f); norm += a; a *= 0.5; f *= 2.03; } return sum / norm; }

// ---------------------------------------------------------------- world
const WORLD = 16000, HALF = WORLD / 2, N = 256, CELL = WORLD / N;
const RWY = { halfW: 22, halfL: 700, h: 24 };

function rawHeight(x, z) {
  const r0 = Math.hypot(x, z);
  const island = 1 - smoothstep(0.6, 1.0, r0 / HALF);
  const hills = fbm(noiseA, x * 0.00022 + 11, z * 0.00022 - 7, 5) * 0.5 + 0.5;
  let ridge = 1 - Math.abs(fbm(noiseB, x * 0.00035 - 3, z * 0.00035 + 5, 4)); ridge = ridge * ridge * ridge;
  const mountainMask = smoothstep(0.42, 0.68, hills) * smoothstep(1500, 3800, r0);
  let h = hills * 280 - 45 + ridge * 1150 * mountainMask + fbm(noiseB, x * 0.003, z * 0.003, 3) * 10;
  h = h * island - 120 * (1 - island);
  const dx = Math.max(0, Math.abs(x) - RWY.halfW - 40), dz = Math.max(0, Math.abs(z) - RWY.halfL - 80);
  const m = 1 - smoothstep(0, 450, Math.hypot(dx, dz));
  return lerp(h, RWY.h, m);
}

const heights = new Float32Array((N + 1) * (N + 1));
for (let iz = 0; iz <= N; iz++) for (let ix = 0; ix <= N; ix++) heights[iz * (N + 1) + ix] = rawHeight(-HALF + ix * CELL, -HALF + iz * CELL);

function groundHeight(x, z) {
  const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
  if (fx < 0 || fz < 0 || fx >= N || fz >= N) return -120;
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, i = iz * (N + 1) + ix;
  return lerp(lerp(heights[i], heights[i + 1], tx), lerp(heights[i + N + 1], heights[i + N + 2], tx), tz);
}
const inRunway = (x, z) => Math.abs(x) < RWY.halfW && Math.abs(z) < RWY.halfL;
const CAR = { halfW: 22, halfL: 165, h: 19, x: 0, z: 0 };
{
  const deep = (x, z) => [[0, 0], [0, 250], [0, -250], [60, 0], [-60, 0], [0, 500], [0, -500]].every(([dx, dz]) => groundHeight(x + dx, z + dz) < -25);
  outer: for (let r = 3500; r < 7800; r += 100) for (let a = 0; a < Math.PI; a += 0.05) for (const sg of [1, -1]) {
    const x = Math.sin(a * sg) * r, z = Math.cos(a * sg) * r;
    if (deep(x, z)) { CAR.x = x; CAR.z = z; break outer; }
  }
}
const onCarrier = (x, z) => Math.abs(x - CAR.x) < CAR.halfW && Math.abs(z - CAR.z) < CAR.halfL;
const onPad = (x, z) => inRunway(x, z) || onCarrier(x, z);
let surfWater = false;
function surfaceAt(x, z) {
  if (inRunway(x, z)) { surfWater = false; return RWY.h + 0.3; }
  if (onCarrier(x, z)) { surfWater = false; return CAR.h; }
  const g = groundHeight(x, z); surfWater = g < 0; return Math.max(g, 0);
}

function terrainRGB(h, slope, x, z) {
  const v = noiseB(x * 0.004, z * 0.004) * 0.05;
  let c;
  if (h < 1.5) { const t = smoothstep(-40, 1.5, h); c = [lerp(0.45, 0.84, t), lerp(0.42, 0.77, t), lerp(0.30, 0.56, t)]; }
  else {
    c = mix3([0.84, 0.77, 0.56], [0.42, 0.60, 0.24], smoothstep(1.5, 8, h));
    c = mix3(c, [0.27, 0.47, 0.17], smoothstep(60, 200, h));
    c = mix3(c, [0.20, 0.34, 0.15], smoothstep(220, 420, h));
    c = mix3(c, [0.47, 0.44, 0.41], Math.max(smoothstep(450, 700, h), smoothstep(0.55, 0.9, slope)));
    c = mix3(c, [0.95, 0.96, 0.98], smoothstep(780, 900, h) * (1 - smoothstep(0.9, 1.3, slope)));
  }
  return [clamp(c[0] + v, 0, 1), clamp(c[1] + v, 0, 1), clamp(c[2] + v * 0.6, 0, 1)];
}

// ---------------------------------------------------------------- renderer / scene
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const HORIZON = new THREE.Color(0xc4dcef), ZENITH = new THREE.Color(0x3b7fd0);
scene.fog = new THREE.Fog(HORIZON, 1800, 11000);
const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 30000);

const sunDir = new V3(0.55, 0.62, -0.45).normalize();
const sky = new THREE.Mesh(new THREE.SphereGeometry(20000, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, depthTest: false,
  uniforms: { top: { value: ZENITH }, horizon: { value: HORIZON }, sunDir: { value: sunDir }, sunColor: { value: new THREE.Color(0xfff1d6) } },
  vertexShader: `varying vec3 vDir; void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vDir = wp.xyz - cameraPosition; gl_Position = projectionMatrix*viewMatrix*wp; }`,
  fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
    void main(){ vec3 d = normalize(vDir); float h = max(d.y, 0.0);
      vec3 col = mix(horizon, top, pow(h, 0.55));
      float s = max(dot(d, sunDir), 0.0);
      col += sunColor * (pow(s, 900.0) * 6.0 + pow(s, 10.0) * 0.22);
      gl_FragColor = vec4(col, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
}));
sky.renderOrder = -1; sky.frustumCulled = false; scene.add(sky);

scene.add(new THREE.HemisphereLight(0xd4e8ff, 0x55683a, 1.1));
const sun = new THREE.DirectionalLight(0xfff0dc, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 800 });
sun.shadow.bias = -0.0005;
scene.add(sun, sun.target);

// terrain
{
  const geo = new THREE.PlaneGeometry(WORLD, WORLD, N, N); geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, colors = new Float32Array(pos.count * 3), col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const ix = i % (N + 1), iz = Math.floor(i / (N + 1));
    const h = heights[i]; pos.setY(i, h);
    const hx = heights[iz * (N + 1) + Math.min(N, ix + 1)] - heights[iz * (N + 1) + Math.max(0, ix - 1)];
    const hz = heights[Math.min(N, iz + 1) * (N + 1) + ix] - heights[Math.max(0, iz - 1) * (N + 1) + ix];
    const slope = Math.hypot(hx, hz) / (2 * CELL);
    const [r, g, b] = terrainRGB(h, slope, pos.getX(i), pos.getZ(i));
    col.setRGB(r, g, b, THREE.SRGBColorSpace);
    colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const terrain = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  terrain.receiveShadow = true;
  scene.add(terrain);

  const water = new THREE.Mesh(new THREE.PlaneGeometry(200000, 200000).rotateX(-Math.PI / 2),
    new THREE.MeshPhongMaterial({ color: 0x2a78ad, specular: 0xa8c8e8, shininess: 90, transparent: true, opacity: 0.88 }));
  water.receiveShadow = true;
  scene.add(water);
}

// runway + airfield
function runwayTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 2048; const g = c.getContext('2d');
  g.fillStyle = '#3b3e44'; g.fillRect(0, 0, 128, 2048);
  for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`; g.fillRect(Math.random() * 128, Math.random() * 2048, 2, 2); }
  g.fillStyle = '#ececec';
  g.fillRect(5, 0, 3, 2048); g.fillRect(120, 0, 3, 2048);
  for (let y = 190; y < 2048 - 190; y += 60) g.fillRect(62, y, 4, 30);
  for (let k = 0; k < 8; k++) { g.fillRect(14 + k * 13, 12, 8, 70); g.fillRect(14 + k * 13, 2048 - 82, 8, 70); }
  g.font = 'bold 48px sans-serif'; g.textAlign = 'center';
  g.fillText('36', 64, 2048 - 100);
  g.save(); g.translate(64, 100); g.rotate(Math.PI); g.fillText('18', 0, 0); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}
{
  const rw = new THREE.Mesh(new THREE.PlaneGeometry(RWY.halfW * 2, RWY.halfL * 2).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: runwayTexture() }));
  rw.position.y = RWY.h + 0.3; rw.receiveShadow = true; scene.add(rw);
  const lightGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0 }), thrMat = new THREE.MeshBasicMaterial({ color: 0x3dff7a }), endMat = new THREE.MeshBasicMaterial({ color: 0xff4040 });
  for (let z = -RWY.halfL; z <= RWY.halfL; z += 70) for (const x of [-RWY.halfW - 1.5, RWY.halfW + 1.5]) {
    const m = new THREE.Mesh(lightGeo, edgeMat); m.position.set(x, RWY.h + 0.6, z); scene.add(m);
  }
  for (let x = -RWY.halfW; x <= RWY.halfW; x += 4) {
    const a = new THREE.Mesh(lightGeo, thrMat); a.position.set(x, RWY.h + 0.6, RWY.halfL + 2); scene.add(a);
    const b = new THREE.Mesh(lightGeo, endMat); b.position.set(x, RWY.h + 0.6, -RWY.halfL - 2); scene.add(b);
  }
  const concrete = new THREE.MeshLambertMaterial({ color: 0xc9c4ba }), roof = new THREE.MeshLambertMaterial({ color: 0x8a94a0 });
  const glass = new THREE.MeshPhongMaterial({ color: 0x1d3548, specular: 0x88aacc, shininess: 120 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(3.5, 4.5, 26, 16), concrete); tower.position.set(95, RWY.h + 13, 120);
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 5.5, 5, 8), glass); cab.position.set(95, RWY.h + 28.5, 120);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 7.5, 1, 8), roof); cap.position.set(95, RWY.h + 31.5, 120);
  scene.add(tower, cab, cap);
  for (let i = 0; i < 3; i++) {
    const hg = new THREE.Mesh(new THREE.BoxGeometry(34, 12, 30), concrete); hg.position.set(100, RWY.h + 6, -60 - i * 45);
    const rf = new THREE.Mesh(new THREE.CylinderGeometry(17, 17, 30, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), roof);
    rf.rotation.set(0, 0, 0); rf.scale.set(1, 0.35, 1); rf.position.set(100, RWY.h + 12, -60 - i * 45);
    scene.add(hg, rf);
  }
  [tower, cab].forEach(m => { m.castShadow = true; });
}

// carrier, PAPI, approach lights, terminal
const papis = [], rabbits = [];
function makePAPI(x, y, z, aimZ, aimY, dir) {
  const lights = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.6), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    m.position.set(x - i * 4 * dir, y + 0.6, z); scene.add(m); lights.push(m);
  }
  papis.push({ lights, aimZ, aimY, z, dir });
}
function updatePAPI() {
  const p = state.pos;
  for (const P of papis) {
    const d = (p.z - P.aimZ) * P.dir, ang = d > 5 ? Math.atan2(p.y - P.aimY, d) * 180 / Math.PI : 0;
    P.lights.forEach((m, i) => m.material.color.setHex(ang > [3.5, 3.17, 2.83, 2.5][i] ? 0xffffff : 0xff2020));
  }
}
function updateRabbits(t) {
  const k = Math.floor(t / 70) % (rabbits.length + 6);
  rabbits.forEach((r, i) => { r.visible = i === k; });
}
{
  // PAPI + approach strobes for runway 36 (landing northbound from the south)
  makePAPI(-RWY.halfW - 10, RWY.h, RWY.halfL - 300, RWY.halfL - 300, RWY.h, 1);
  const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffffff }), barMat = new THREE.MeshBasicMaterial({ color: 0xfff1b0 }), poleMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
  for (let i = 0; i < 14; i++) {
    const z = RWY.halfL + 420 - i * 28, gh = groundHeight(0, z), y = Math.max(gh, 0) + 3;
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.3, y - gh + 1, 0.3), poleMat); pole.position.set(0, (y + gh) / 2, z); scene.add(pole);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(14, 0.5, 0.5), barMat); bar.position.set(0, y, z); scene.add(bar);
    const st = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6), strobeMat); st.position.set(0, y + 1, z); st.visible = false; scene.add(st); rabbits.push(st);
  }
  // terminal, apron, airliners, windsock
  const concrete = new THREE.MeshLambertMaterial({ color: 0xd9d6cf }), glassM = new THREE.MeshPhongMaterial({ color: 0x2a4d6b, specular: 0x99bbdd, shininess: 100 });
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(170, 330).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x55585e }));
  apron.position.set(125, RWY.h + 0.25, 330); apron.receiveShadow = true; scene.add(apron);
  const twy = new THREE.Mesh(new THREE.PlaneGeometry(58, 18).rotateX(-Math.PI / 2), apron.material); twy.position.set(RWY.halfW + 18, RWY.h + 0.26, 330); scene.add(twy);
  const term = new THREE.Mesh(new THREE.BoxGeometry(34, 16, 300), concrete); term.position.set(195, RWY.h + 8, 330); term.castShadow = true; scene.add(term);
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7, 296), glassM); band.position.set(177.8, RWY.h + 9, 330); scene.add(band);
  const roofM = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
  const roofT = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 304, 20, 1, false, -Math.PI / 2, Math.PI).rotateX(Math.PI / 2), roofM);
  roofT.scale.set(0.8, 0.22, 1); roofT.position.set(195, RWY.h + 16, 330); scene.add(roofT);
  const sign = document.createElement('canvas'); sign.width = 1024; sign.height = 128; const sg = sign.getContext('2d');
  sg.fillStyle = '#123'; sg.fillRect(0, 0, 1024, 128); sg.fillStyle = '#ffd27f'; sg.font = 'bold 84px system-ui'; sg.textAlign = 'center'; sg.fillText('PRICE INTERNATIONAL', 512, 96);
  const sTex = new THREE.CanvasTexture(sign); sTex.colorSpace = THREE.SRGBColorSpace;
  const signM = new THREE.Mesh(new THREE.PlaneGeometry(90, 11), new THREE.MeshBasicMaterial({ map: sTex })); signM.position.set(177.5, RWY.h + 21, 330); signM.rotation.y = -Math.PI / 2; scene.add(signM);
  const liv = [0x1d4f91, 0xc8102e, 0x0b7a3b];
  for (let i = 0; i < 3; i++) {
    const a = airliner(liv[i]); a.position.set(140, RWY.h + 0.3, 220 + i * 110); a.rotation.y = -Math.PI / 2; scene.add(a);
    const jb = new THREE.Mesh(new THREE.BoxGeometry(20, 3, 3), concrete); jb.position.set(168, RWY.h + 5, 212 + i * 110); scene.add(jb);
  }
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 7), new THREE.MeshLambertMaterial({ color: 0xdddddd })); pole.position.set(-RWY.halfW - 30, RWY.h + 3.5, RWY.halfL - 150); scene.add(pole);
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.9, 5, 12, 1, true).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xff6a00, side: THREE.DoubleSide }));
  sock.position.set(-RWY.halfW - 27.5, RWY.h + 6.7, RWY.halfL - 150); sock.rotation.y = 0.4; scene.add(sock);

  // aircraft carrier
  const hullM = new THREE.MeshLambertMaterial({ color: 0x5c636b }), deckTex = (() => {
    const c = document.createElement('canvas'); c.width = 256; c.height = 2048; const g = c.getContext('2d');
    g.fillStyle = '#3a3d42'; g.fillRect(0, 0, 256, 2048);
    for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(Math.random() * 256, Math.random() * 2048, 2, 2); }
    g.fillStyle = '#f2f2f2'; g.fillRect(8, 0, 4, 2048); g.fillRect(244, 0, 4, 2048);
    g.fillStyle = '#ffd400'; for (let y = 80; y < 2048; y += 50) g.fillRect(126, y, 4, 28);
    g.fillStyle = '#e8e8e8'; for (let w = 0; w < 4; w++) g.fillRect(20, 2048 - (50 + w * 12) / 330 * 2048, 216, 5);
    g.fillStyle = '#ffffff'; g.font = 'bold 150px sans-serif'; g.textAlign = 'center'; g.save(); g.translate(128, 520); g.fillText('72', 0, 0); g.restore();
    g.strokeStyle = '#ffd400'; g.lineWidth = 3; for (const x of [60, 196]) { g.beginPath(); g.moveTo(x, 40); g.lineTo(x, 560); g.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
  })();
  const car = new THREE.Group(); car.position.set(CAR.x, 0, CAR.z); scene.add(car);
  const sh = new THREE.Shape(); const W = CAR.halfW + 2, L = CAR.halfL;
  sh.moveTo(-W, L); sh.lineTo(W, L); sh.lineTo(W + 4, -L * 0.2); sh.lineTo(W, -L * 0.85); sh.lineTo(0, -L - 22); sh.lineTo(-W, -L * 0.85); sh.lineTo(-W, L);
  const hull = new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: CAR.h + 8, bevelEnabled: false }).rotateX(Math.PI / 2), hullM);
  hull.position.y = CAR.h - 0.05; hull.castShadow = true; car.add(hull);
  const deck = new THREE.Mesh(new THREE.PlaneGeometry(CAR.halfW * 2, CAR.halfL * 2).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: deckTex }));
  deck.position.y = CAR.h + 0.02; deck.receiveShadow = true; car.add(deck);
  const isl = new THREE.Mesh(new THREE.BoxGeometry(8, 16, 34), hullM); isl.position.set(W + 3, CAR.h + 8, -10); isl.castShadow = true; car.add(isl);
  const br = new THREE.Mesh(new THREE.BoxGeometry(8.4, 2.4, 20), glassM); br.position.set(W + 3, CAR.h + 13.5, -14); car.add(br);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.8, 14, 6), hullM); mast.position.set(W + 3, CAR.h + 23, -8); car.add(mast);
  const radar = new THREE.Mesh(new THREE.BoxGeometry(6, 1.5, 0.4), new THREE.MeshLambertMaterial({ color: 0x9aa3ab })); radar.position.set(W + 3, CAR.h + 28, -8); car.add(radar);
  CAR.radar = radar;
  const wake = new THREE.Mesh(new THREE.PlaneGeometry(26, 200).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false }));
  wake.position.set(0, 0.3, L + 100); car.add(wake);
  makePAPI(CAR.x - CAR.halfW - 3, CAR.h, CAR.z + CAR.halfL - 68, CAR.z + CAR.halfL - 68, CAR.h, 1);
}
function airliner(color) {
  const g = new THREE.Group(), white = new THREE.MeshLambertMaterial({ color: 0xf4f4f4 }), liv = new THREE.MeshLambertMaterial({ color }), grey = new THREE.MeshLambertMaterial({ color: 0x9aa0a6 });
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.1, 38, 14).rotateX(Math.PI / 2), white); fus.position.y = 4; g.add(fus);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(2.1, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(-Math.PI / 2), white); nose.scale.set(1, 1, 1.6); nose.position.set(0, 4, -19); g.add(nose);
  const tailc = new THREE.Mesh(new THREE.ConeGeometry(2.1, 8, 14).rotateX(Math.PI / 2), white); tailc.position.set(0, 4.4, 23); g.add(tailc);
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(2.13, 2.13, 38, 14, 1, true, Math.PI * 0.35, Math.PI * 0.3).rotateX(Math.PI / 2), liv); stripe.position.y = 4; stripe.rotation.z = Math.PI; g.add(stripe);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(36, 0.5, 6), white); wing.position.set(0, 3, 1); g.add(wing);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8, 6), liv); fin.position.set(0, 9, 23); fin.rotation.x = -0.35; g.add(fin);
  const hs = new THREE.Mesh(new THREE.BoxGeometry(13, 0.4, 3.5), white); hs.position.set(0, 4.6, 24); g.add(hs);
  for (const x of [-7, 7]) { const e = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 4.5, 12).rotateX(Math.PI / 2), grey); e.position.set(x, 1.8, -1); g.add(e); }
  for (const [x, z] of [[0, -14], [-2.5, 2], [2.5, 2]]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.5, 10).rotateZ(Math.PI / 2), grey); w.position.set(x, 0.6, z); g.add(w); }
  g.traverse(m => { if (m.isMesh) m.castShadow = true; });
  return g;
}

// trees
{
  const geo = new THREE.ConeGeometry(1, 1, 7); geo.translate(0, 0.5, 0);
  const MAX = 8000, trees = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ flatShading: true }), MAX);
  const rng = mulberry32(99), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(), p = new V3(), c = new THREE.Color();
  let n = 0;
  for (let i = 0; i < 90000 && n < MAX; i++) {
    const x = (rng() - 0.5) * WORLD * 0.9, z = (rng() - 0.5) * WORLD * 0.9;
    if (Math.abs(x) < 220 && Math.abs(z) < RWY.halfL + 450) continue;
    const h = groundHeight(x, z); if (h < 6 || h > 430) continue;
    const sl = Math.hypot(groundHeight(x + 8, z) - groundHeight(x - 8, z), groundHeight(x, z + 8) - groundHeight(x, z - 8)) / 16;
    if (sl > 0.45 || fbm(noiseB, x * 0.0012, z * 0.0012, 3) < 0.02) continue;
    const th = 10 + rng() * 16; p.set(x, h - 1, z); s.set(th * 0.28, th, th * 0.28);
    trees.setMatrixAt(n, m4.compose(p, q, s));
    trees.setColorAt(n, c.setRGB(0.10 + rng() * 0.08, 0.28 + rng() * 0.14, 0.11 + rng() * 0.05, THREE.SRGBColorSpace));
    n++;
  }
  trees.count = n; trees.frustumCulled = false; scene.add(trees);
}

// clouds
{
  const MAX = 700, clouds = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1),
    new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x7d889a, flatShading: true }), MAX);
  const rng = mulberry32(5), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(), p = new V3();
  let n = 0;
  for (let c = 0; c < 90 && n < MAX; c++) {
    const cx = (rng() - 0.5) * WORLD * 1.1, cz = (rng() - 0.5) * WORLD * 1.1, cy = 900 + rng() * 500;
    const puffs = 5 + Math.floor(rng() * 5);
    for (let k = 0; k < puffs && n < MAX; k++) {
      const r = 45 + rng() * 75;
      p.set(cx + (rng() - 0.5) * 260, cy + (rng() - 0.5) * 40, cz + (rng() - 0.5) * 140);
      s.set(r, r * 0.55, r * 0.85);
      clouds.setMatrixAt(n++, m4.compose(p, q, s));
    }
  }
  clouds.count = n; clouds.frustumCulled = false; scene.add(clouds);
}

// ---------------------------------------------------------------- aircraft
let typeIdx = clamp(parseInt(localStorage.getItem('skyward_plane') ?? '1', 10) || 0, 0, TYPES.length - 1);
let ptype = TYPES[typeIdx];
let plane = buildPlane(ptype);
scene.add(plane.group);

// ---------------------------------------------------------------- course
const RING_COUNT = 12, RING_R = 22;
const rings = [];
{
  const rng = mulberry32(7);
  let a = Math.PI, p = new V3(0, 0, -RWY.halfL - 1000), prev = new V3(0, RWY.h, -RWY.halfL);
  const dirOf = ang => new V3(Math.sin(ang), 0, Math.cos(ang));
  const pts = [];
  for (let i = 0; i < RING_COUNT; i++) {
    if (i > 0) {
      a += (rng() - 0.5) * 1.4;
      const cand = p.clone().addScaledVector(dirOf(a), 800);
      if (Math.hypot(cand.x, cand.z) > HALF * 0.5) a = Math.atan2(-p.x, -p.z) + (rng() - 0.5) * 0.6;
      prev = p.clone();
      p = p.clone().addScaledVector(dirOf(a), 800);
    }
    let gmax = 0;
    for (let s = 0; s <= 12; s++) { const t = s / 12; gmax = Math.max(gmax, groundHeight(lerp(prev.x, p.x, t), lerp(prev.z, p.z, t))); }
    p.y = Math.max(gmax, groundHeight(p.x, p.z), 0) + 110 + rng() * 150;
    pts.push(p.clone());
  }
  const geo = new THREE.TorusGeometry(RING_R, 1.7, 12, 48);
  pts.forEach((pt, i) => {
    const dir = (i < pts.length - 1 ? pts[i + 1].clone().sub(pt) : pt.clone().sub(pts[i - 1])).normalize();
    if (i > 0) { const inDir = pt.clone().sub(pts[i - 1]).normalize(); dir.add(inDir).normalize(); }
    else dir.add(new V3(0, 0, -1)).normalize();
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x4fd8ff, transparent: true, opacity: 0.4 }));
    mesh.position.copy(pt); mesh.lookAt(pt.clone().add(dir));
    scene.add(mesh);
    rings.push({ pos: pt, n: dir, mesh });
  });
}

// ---------------------------------------------------------------- audio
class SimAudio {
  constructor() { this.ctx = null; this.muted = false; }
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.5; this.master.connect(ctx.destination);
    this.eng = ctx.createGain(); this.eng.gain.value = 0;
    this.lp = ctx.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.frequency.value = 400; this.lp.Q.value = 3;
    this.o1 = ctx.createOscillator(); this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator(); this.o2.type = 'square'; this.o2.detune.value = 9;
    this.o1.connect(this.lp); this.o2.connect(this.lp); this.lp.connect(this.eng); this.eng.connect(this.master);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    this.wind = ctx.createBufferSource(); this.wind.buffer = buf; this.wind.loop = true;
    this.wf = ctx.createBiquadFilter(); this.wf.type = 'bandpass'; this.wf.frequency.value = 500; this.wf.Q.value = 0.6;
    this.wg = ctx.createGain(); this.wg.gain.value = 0;
    this.wind.connect(this.wf); this.wf.connect(this.wg); this.wg.connect(this.master);
    this.o1.start(); this.o2.start(); this.wind.start();
  }
  update(thr, speed, alive, jet = false) {
    if (!this.ctx) return; const t = this.ctx.currentTime, f = jet ? 70 + thr * 160 : 42 + thr * 90 + speed * 0.25;
    this.o1.frequency.setTargetAtTime(f, t, 0.12); this.o2.frequency.setTargetAtTime(f * 2.01, t, 0.12);
    this.lp.frequency.setTargetAtTime(260 + thr * 1500, t, 0.12);
    this.eng.gain.setTargetAtTime(alive ? (jet ? 0.02 + thr * 0.04 : 0.05 + thr * 0.11) : 0, t, 0.15);
    this.wg.gain.setTargetAtTime(alive ? Math.min(0.3, speed * speed * 0.000035 + (jet ? thr * 0.16 : 0)) : 0, t, 0.25);
    this.wf.frequency.setTargetAtTime(300 + speed * 9, t, 0.25);
  }
  beep(freq, dur, type = 'sine', vol = 0.18, delay = 0) {
    if (!this.ctx) return; const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  }
  whistle() {
    if (!this.ctx) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(420, t + 1.8);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.05, t + 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 2);
  }
  boom(vol = 1) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(1200, t); f.frequency.exponentialRampToValueAtTime(80, t + 1.6);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.9 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.8);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + 2);
  }
  kick(vol = 0.22) {
    if (!this.ctx) return; const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(260, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.2);
  }
  toggleMute() { this.muted = !this.muted; if (this.master) this.master.gain.value = this.muted ? 0 : 0.5; return this.muted; }
}
const audio = new SimAudio();

// ---------------------------------------------------------------- input
const input = { thrUp: false, thrDown: false, noseUp: false, noseDown: false, rollL: false, rollR: false, yawL: false, yawR: false, brake: false, fire: false };
const keymap = {
  ShiftLeft: 'thrUp', ShiftRight: 'thrUp', Equal: 'thrUp', NumpadAdd: 'thrUp',
  KeyZ: 'thrDown', Minus: 'thrDown', NumpadSubtract: 'thrDown',
  KeyS: 'noseUp', ArrowDown: 'noseUp', KeyW: 'noseDown', ArrowUp: 'noseDown',
  KeyA: 'rollL', ArrowLeft: 'rollL', KeyD: 'rollR', ArrowRight: 'rollR',
  KeyQ: 'yawL', KeyE: 'yawR', KeyB: 'brake', Space: 'fire', KeyF: 'fire',
};
let invertPitch = localStorage.getItem('skyward_invert') === '1';
addEventListener('keydown', e => {
  if (keymap[e.code]) { input[keymap[e.code]] = true; e.preventDefault(); }
  if (e.repeat) return;
  if (e.code === 'Space') e.preventDefault();
  if (/^Digit[1-5]$/.test(e.code)) { selectPlane(+e.code.slice(5) - 1); return; }
  if (e.code === 'KeyK') { setStart(startAt === 'carrier' ? 'airfield' : 'carrier'); return; }
  if (!started) return;
  if (e.code === 'KeyX' && !paused) dropBomb();
  if (e.code === 'KeyV' && !paused && ptype.vtol && !state.crashed) {
    state.nozzleTarget = state.nozzleTarget ? 0 : 1;
    flash(state.nozzleTarget ? 'Nozzles down: hover mode' : 'Nozzles aft: forward flight', state.nozzleTarget ? 'Throttle controls lift. A/D/S/W tilt, Q/E turn' : '', 2);
  }
  if (e.code === 'KeyH') { el.keysHud.classList.toggle('hidden'); localStorage.setItem('skyward_keys', el.keysHud.classList.contains('hidden') ? '0' : '1'); }
  if (e.code === 'KeyC') { cam.mode = (cam.mode + 1) % CAM_MODES.length; cam.flySet = false; }
  if (e.code === 'KeyR') restart();
  if (e.code === 'KeyP' || e.code === 'Escape') setPaused(!paused);
  if (e.code === 'KeyM') flash(audio.toggleMute() ? 'Sound off' : 'Sound on');
  if (e.code === 'KeyI') { invertPitch = !invertPitch; localStorage.setItem('skyward_invert', invertPitch ? '1' : '0'); updateInvLabel(); flash(invertPitch ? 'Pitch inverted: W / ↑ = nose up' : 'Pitch normal: S / ↓ = nose up'); }
});
addEventListener('keyup', e => { if (keymap[e.code]) input[keymap[e.code]] = false; });
addEventListener('blur', () => { for (const k in input) input[k] = false; if (started) setPaused(true); });

// ---------------------------------------------------------------- simulation
const state = { nozzle: 0, nozzleTarget: 0, hover: 0, health: 100, bombs: 0, pos: new V3(), vel: new V3(), q: new THREE.Quaternion(), rates: new V3(), throttle: 0, grounded: true, crashed: false, aoa: 0, airTime: 0, wasAirborne: false };
let startAt = localStorage.getItem('skyward_start') === 'carrier' ? 'carrier' : 'airfield';
const race = { next: 0, started: false, time: 0, done: false, landedAfter: false };
let best = parseFloat(localStorage.getItem('skyward_best')) || null;
const GEAR = 1.6, G = 9.81, STALL = 0.28, CL0 = 0.5;
const _f = new V3(), _u = new V3(), _r = new V3(), _vl = new V3(), _acc = new V3(), _vd = new V3(), _lift = new V3(), _w = new V3(), _prev = new V3(), _tmp = new V3();
const _dq = new THREE.Quaternion(), _iq = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ');
const crashPos = new V3(), _yAxis = new V3(0, 1, 0);

function axes(q) { _f.set(0, 0, -1).applyQuaternion(q); _u.set(0, 1, 0).applyQuaternion(q); _r.set(1, 0, 0).applyQuaternion(q); }

function liftCoeff(aoa) {
  if (aoa >= STALL) return (CL0 + 4 * STALL) * Math.max(0.35, 1 - (aoa - STALL) * 2.5);
  if (aoa <= -0.2) return (CL0 - 0.8) * Math.max(0.35, 1 - (-0.2 - aoa) * 2.5);
  return CL0 + 4 * aoa;
}

function step(dt) {
  const s = state; if (s.crashed) return;
  const P = ptype;
  if (input.thrUp) s.throttle = Math.min(1, s.throttle + 0.7 * dt);
  if (input.thrDown) s.throttle = Math.max(0, s.throttle - 0.7 * dt);
  s.nozzle = P.vtol ? s.nozzle + clamp(s.nozzleTarget - s.nozzle, -0.8 * dt, 0.8 * dt) : 0;
  const q = s.q, v = s.vel;
  axes(q);
  const speed = v.length();
  _iq.copy(q).invert(); _vl.copy(v).applyQuaternion(_iq);
  const fs = Math.max(-_vl.z, 0.5);
  const aoa = speed > 2 ? Math.atan2(-_vl.y, fs) : 0, beta = speed > 2 ? Math.atan2(_vl.x, fs) : 0;
  s.aoa = aoa;

  let pIn = (input.noseUp ? 1 : 0) - (input.noseDown ? 1 : 0); if (invertPitch) pIn = -pIn;
  const rIn = (input.rollR ? 1 : 0) - (input.rollL ? 1 : 0), yIn = (input.yawR ? 1 : 0) - (input.yawL ? 1 : 0);
  const eff = clamp((speed - 0.25 * P.vr) / (0.8 * P.vr), 0, 1), k = Math.min(1, dt * 8);
  const hover = s.nozzle * (1 - clamp(speed / 50, 0, 1)), ctrl = Math.max(eff, hover);
  s.hover = hover;
  const dyn = P.LK * speed * speed;
  const aoaMax = dyn > 1e-3 ? Math.min(STALL - 0.01, (P.gLim * 1.3 * G / dyn - CL0) / 4) : STALL;
  const guard = speed < 0.6 * P.vr ? 1 : pIn > 0 ? clamp((aoaMax - aoa) / 0.06, 0, 1) : clamp((aoa + 0.2) / 0.06, 0, 1);
  s.rates.x += (pIn * P.pitch * 1.35 * ctrl * guard - s.rates.x) * k;
  s.rates.z += (-rIn * Math.min(P.roll * 1.4, 3.2) * ctrl - s.rates.z) * k;
  s.rates.y += (-yIn * 0.9 * ctrl - s.rates.y) * k;
  const trimAoa = s.grounded || dyn < 1e-3 ? 0 : clamp((G * _u.y / dyn - CL0) / 4, -0.15, STALL - 0.03);
  const wv = (2 + speed * 0.02) * eff;
  _w.set(s.rates.x - (aoa - trimAoa) * wv, s.rates.y - beta * wv, s.rates.z);
  if (!s.grounded && speed > 5) {
    if (pIn === 0) _w.x -= clamp(v.y / speed, -0.3, 0.3) * 0.5 * eff;
    const bank = Math.atan2(-_r.y, _u.y);
    if (rIn === 0 && Math.abs(bank) < 1.75) _w.z += bank * 0.3 * eff;
  }
  if (hover > 0.05 && !s.grounded) {
    const pitch = Math.asin(clamp(_f.y, -1, 1)), bank = Math.atan2(-_r.y, _u.y);
    if (pIn === 0) _w.x += (0.06 - pitch) * 1.5 * hover;
    if (rIn === 0) _w.z += bank * 1.5 * hover;
  }
  if (s.grounded) { _w.y = -(yIn + rIn) * 0.6 * clamp(speed / 8, 0, 1) * (1 - eff * 0.6); _w.z = 0; }
  const ang = _w.length();
  if (ang > 1e-6) { _dq.setFromAxisAngle(_tmp.copy(_w).divideScalar(ang), ang * dt); q.multiply(_dq).normalize(); }
  if (s.grounded) { _e.setFromQuaternion(q); _e.z *= Math.max(0, 1 - dt * 8); if (_e.x < 0) _e.x = 0; q.setFromEuler(_e); }
  axes(q);
  if (!s.grounded && speed > 5 && _u.y > 0.05) {
    const yr = -(_r.y < 0 ? 1 : -1) * Math.min(1, Math.abs(_r.y)) * 0.4 * eff * dt;
    _dq.setFromAxisAngle(_yAxis, yr); q.premultiply(_dq).normalize(); v.applyAxisAngle(_yAxis, yr); axes(q);
    if (pIn === 0 && hover < 0.3) v.y += G * (1 - _u.y) * 0.85 * eff * dt;
  }

  const na = s.nozzle * 1.45, T = s.throttle * P.thrust;
  _acc.set(0, -G, 0).addScaledVector(_f, T * Math.cos(na)).addScaledVector(_u, T * Math.sin(na));
  if (speed > 0.5) {
    _vd.copy(v).divideScalar(speed);
    const cl = liftCoeff(aoa);
    _lift.copy(_u).addScaledVector(_vd, -_u.dot(_vd)); const ll = _lift.length();
    if (ll > 1e-3) _acc.addScaledVector(_lift, P.LK * cl * speed * speed / ll);
    const cd = 0.022 + 0.02 * cl * cl + (aoa > STALL ? 0.25 : 0);
    _acc.addScaledVector(_vd, -P.DK * cd * speed * speed);
    _acc.addScaledVector(_r, -v.dot(_r) * 0.6);
  }
  v.addScaledVector(_acc, dt);
  if (hover > 0.05 && !s.grounded) { const d = 1 - 0.6 * hover * dt; v.x *= d; v.z *= d; v.y *= 1 - 1.0 * hover * dt; }
  if (s.grounded) {
    v.addScaledVector(_r, -v.dot(_r) * Math.min(1, dt * 10));
    if (s.cat && s.throttle > 0.9 && onCarrier(s.pos.x, s.pos.z)) {
      if (!s.catFired) { s.catFired = true; flash('Catapult launch!', 'Hold on, Captain Price', 1.5); audio.beep(140, 0.9, 'sawtooth', 0.12); }
      v.addScaledVector(_f, 34 * dt); if (speed > P.vr * 1.25) s.cat = false;
    }
    if (s.trap) { const hs0 = v.length(); if (s.throttle > 0.9 || !onCarrier(s.pos.x, s.pos.z)) s.trap = false; else if (hs0 > 0.01) v.multiplyScalar(Math.max(0, hs0 - 30 * dt) / hs0); }
    const hs = Math.hypot(v.x, v.z);
    if (hs > 0.01) { const f = Math.max(0, hs - (0.25 + (input.brake ? 6 : 0)) * dt) / hs; v.x *= f; v.z *= f; }
  } else s.airTime += dt;

  _prev.copy(s.pos);
  s.pos.addScaledVector(v, dt);
  const p = s.pos;

  // collisions
  const surf = surfaceAt(p.x, p.z), water = surfWater;
  const gearY = p.y - GEAR * _u.y, tipY = p.y - Math.abs(_r.y) * P.half, noseY = p.y + _f.y * P.nose;
  if (tipY < surf - 0.3 || noseY < surf - 0.4 || (_u.y < 0.3 && p.y < surf + 1.5)) return crash(water ? 'Splashdown!' : 'You hit the ground!');
  if (gearY <= surf) {
    if (!s.grounded) {
      if (water) return crash('Splashdown!', 'The sea is not a runway.');
      if (v.y < -7.5) return crash('Hard impact!', 'Gear collapsed at ' + Math.round(-v.y * 196.85) + ' fpm.');
      if (_u.y < 0.9) return crash('Wingtip strike!', 'Level the wings before touchdown.');
      touchdown(v.y * 196.85);
    }
    p.y += surf - gearY; if (v.y < 0) v.y = 0; s.grounded = true;
  } else if (gearY > surf + 0.25 && s.grounded) { s.grounded = false; liftoff(); }
  if (p.y > 6000) v.y = Math.min(v.y, 0);

  checkRing(_prev, p);
}

function checkRing(a, b) {
  if (race.next >= RING_COUNT) return;
  const r = rings[race.next];
  const s0 = _tmp.copy(a).sub(r.pos).dot(r.n), s1 = _tmp.copy(b).sub(r.pos).dot(r.n);
  if (s0 < 0 && s1 >= 0) {
    const t = s0 / (s0 - s1);
    _tmp.copy(a).lerp(b, t);
    if (_tmp.distanceTo(r.pos) < RING_R + 1) passRing();
  }
}

function passRing() {
  score += 100;
  const r = rings[race.next];
  r.mesh.visible = false; burst(r.pos, 0x7fe0ff, 40);
  race.next++;
  audio.beep(880, 0.18, 'triangle', 0.2); audio.beep(1320, 0.25, 'triangle', 0.18, 0.08);
  if (race.next >= RING_COUNT) {
    race.done = true;
    const newBest = !best || race.time < best;
    if (newBest) { best = race.time; localStorage.setItem('skyward_best', String(best)); }
    flash(`Nice flying, Captain Price! ${fmtTime(race.time)}`, newBest ? 'New best time! Now land back on the runway.' : `Best ${fmtTime(best)}. Now land back on the runway.`, 5);
    audio.beep(660, 0.2, 'triangle', 0.2, 0.3); audio.beep(990, 0.4, 'triangle', 0.2, 0.45);
  } else flash(`Ring ${race.next} / ${RING_COUNT}`, '', 1.2);
  styleRings();
}

function styleRings() {
  rings.forEach((r, i) => {
    const isNext = i === race.next;
    r.mesh.material.color.set(isNext ? 0xffc933 : 0x4fd8ff);
    r.mesh.material.opacity = isNext ? 1 : 0.4;
    r.mesh.material.transparent = !isNext;
    if (i >= race.next) r.mesh.visible = true;
  });
}

function liftoff() {
  state.wasAirborne = true; state.airTime = 0;
  if (!race.started) { race.started = true; flash('Airborne, Captain Price!', 'Follow the yellow marker to the first ring. Hold Space to fire soccer balls.', 3.5); }
}
function touchdown(vsFpm) {
  if (state.airTime > 2) {
    const fpm = Math.round(-vsFpm);
    const rating = fpm < 150 ? 'Butter!' : fpm < 400 ? 'Smooth landing' : fpm < 750 ? 'Firm landing' : 'Hard landing';
    const ds = CAR.z + CAR.halfL - state.pos.z;
    if (onCarrier(state.pos.x, state.pos.z) && ds < 130) {
      const wire = clamp(Math.round((ds - 50) / 12) + 1, 1, 4);
      state.trap = true; const pts = wire === 3 ? 1000 : 600; score += pts;
      flash(`Trap! Caught the ${wire}-wire`, `${wire === 3 ? 'Perfect carrier landing' : 'Carrier landing'} · ${fpm} fpm · +${pts}`, 3.5);
      audio.beep(90, 0.5, 'sawtooth', 0.14);
    } else flash(rating, `Touchdown at ${fpm} fpm${onPad(state.pos.x, state.pos.z) ? '' : ' (off-airport!)'}`, 3);
  }
  state.airTime = 0;
}

function crash(title, sub = '') {
  const s = state; s.crashed = true; crashPos.copy(s.pos);
  plane.group.visible = false; explode(s.pos); audio.boom();
  showMsg(title, (sub ? sub + ' — ' : '') + 'Cameron walks away. Press R to try again');
}

function restart() {
  const s = state;
  s.pos.set(0, RWY.h + 0.3 + GEAR, RWY.halfL - 70); s.vel.set(0, 0, 0); s.q.identity(); s.rates.set(0, 0, 0);
  s.throttle = 0; s.grounded = true; s.crashed = false; s.airTime = 0; s.wasAirborne = false; s.trap = false; s.cat = startAt === 'carrier'; s.catFired = false;
  if (s.cat) s.pos.set(CAR.x, CAR.h + GEAR, CAR.z + CAR.halfL - 40);
  Object.assign(race, { next: 0, started: false, time: 0, done: false, landedAfter: false });
  plane.group.visible = true; styleRings();
  for (const d of debris) scene.remove(d.mesh); debris.length = 0;
  for (const b of balls) scene.remove(b.mesh); balls.length = 0; goals = 0; fireCd = 0;
  s.health = 100; s.bombs = ptype.bombs; s.nozzle = 0; s.nozzleTarget = 0; s.hover = 0;
  for (const e of [...enemies]) removeEnemy(e);
  for (const t of tracers) scene.remove(t.mesh); tracers.length = 0;
  for (const b of bombs) scene.remove(b.g); bombs.length = 0;
  score = 0; banditKills = 0; banditTimer = 25; hitFlash = 0; allClear = false; resetUnits();
  cam.rel.set(0, ptype.cam[0], ptype.cam[1]); cam.flySet = false;
  showMsg('', ''); msgTimer = 0;
}

// ---------------------------------------------------------------- particles
const debris = [];
const boxGeo = new THREE.BoxGeometry(1, 1, 1), sphGeo = new THREE.IcosahedronGeometry(1, 1);
function explode(p, sc = 1) {
  const fire = [0xffd24a, 0xff8a2b, 0xff4d2b, 0x555555, 0x333333], n = Math.round(90 * sc);
  for (let i = 0; i < n; i++) {
    const smoke = i > n * 0.6;
    const mesh = new THREE.Mesh(smoke ? sphGeo : boxGeo, new THREE.MeshBasicMaterial({ color: smoke ? 0x444444 : fire[i % 3], transparent: true, depthWrite: false }));
    mesh.position.copy(p);
    const v = new V3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize().multiplyScalar((smoke ? 6 + Math.random() * 8 : 15 + Math.random() * 35) * (0.6 + 0.4 * sc));
    const life = smoke ? 3 + Math.random() * 2 : 1 + Math.random() * 1.5;
    mesh.scale.setScalar(smoke ? 3 : 0.6 + Math.random());
    scene.add(mesh); debris.push({ mesh, v, life, max: life, smoke, size: 3 * Math.max(0.5, sc), grav: smoke ? -2 : G });
  }
  const ball = new THREE.Mesh(sphGeo, new THREE.MeshBasicMaterial({ color: 0xffa640, transparent: true, depthWrite: false }));
  ball.position.copy(p); scene.add(ball); debris.push({ mesh: ball, v: new V3(), life: 0.9, max: 0.9, fireball: true, size: sc, grav: 0 });
}
function burst(p, color, n) {
  for (let i = 0; i < n; i++) {
    const mesh = new THREE.Mesh(boxGeo, new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }));
    mesh.position.copy(p); mesh.scale.setScalar(1.2);
    const v = new V3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(20 + Math.random() * 20);
    scene.add(mesh); debris.push({ mesh, v, life: 1.2, max: 1.2, grav: 0 });
  }
}
function updateDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i]; d.life -= dt;
    if (d.life <= 0) { scene.remove(d.mesh); d.mesh.material.dispose(); debris.splice(i, 1); continue; }
    const t = d.life / d.max;
    if (d.fireball) { d.mesh.scale.setScalar((4 + (1 - t) * 26) * d.size); d.mesh.material.opacity = t; continue; }
    d.v.y -= d.grav * dt; d.v.multiplyScalar(1 - dt * (d.smoke ? 0.6 : 0.3));
    d.mesh.position.addScaledVector(d.v, dt);
    const gh = surfaceAt(d.mesh.position.x, d.mesh.position.z);
    if (d.mesh.position.y < gh) { d.mesh.position.y = gh; d.v.y *= -0.3; d.v.x *= 0.6; d.v.z *= 0.6; }
    d.mesh.material.opacity = Math.min(1, t * 1.5);
    if (d.smoke) d.mesh.scale.setScalar(d.size * (1 + (1 - t) * 4));
    else d.mesh.rotation.x += dt * 5;
  }
}

// ---------------------------------------------------------------- soccer balls
function soccerTexture() {
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), img = g.createImageData(W, H);
  const pos = new THREE.IcosahedronGeometry(1, 0).attributes.position, pent = [], hex = [];
  for (let i = 0; i < pos.count; i++) { const v = new V3().fromBufferAttribute(pos, i).normalize(); if (!pent.some(p => p.distanceTo(v) < 1e-3)) pent.push(v); }
  for (let i = 0; i < pos.count; i += 3) hex.push(new V3().fromBufferAttribute(pos, i).add(new V3().fromBufferAttribute(pos, i + 1)).add(new V3().fromBufferAttribute(pos, i + 2)).normalize());
  const centers = [...pent.map(v => [v, true]), ...hex.map(v => [v, false])], d = new V3();
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const phi = (px + 0.5) / W * Math.PI * 2, th = (py + 0.5) / H * Math.PI;
    d.set(-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th));
    let a1 = 9, a2 = 9, isPent = false;
    for (const [cv, p] of centers) { const a = Math.acos(clamp(cv.dot(d), -1, 1)); if (a < a1) { a2 = a1; a1 = a; isPent = p; } else if (a < a2) a2 = a; }
    const col = a2 - a1 < 0.03 ? 70 : isPent ? 22 : 245, i = (py * W + px) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = col; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const BALL_R = 0.7, MAX_BALLS = 150;
const ballGeo = new THREE.SphereGeometry(BALL_R, 16, 12), ballMat = new THREE.MeshStandardMaterial({ map: soccerTexture(), roughness: 0.45 });
const balls = [], _bAxis = new V3(), _bPrev = new V3(), _bp = new V3();
let goals = 0, fireCd = 0, fireSide = 1, shotsFired = 0;
function fireBall() {
  axes(state.q); fireSide = -fireSide;
  const mesh = new THREE.Mesh(ballGeo, ballMat); mesh.castShadow = true;
  mesh.position.copy(state.pos).addScaledVector(_f, 1.2).addScaledVector(_r, fireSide * ptype.half * 0.45).addScaledVector(_u, -0.5);
  mesh.rotation.set(Math.random() * 6, Math.random() * 6, 0);
  const v = state.vel.clone().addScaledVector(_f, ptype.ball).addScaledVector(_u, 2)
    .add(new V3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(4));
  scene.add(mesh); balls.push({ mesh, v, life: 14, w: 12, scored: new Set() });
  if (balls.length > MAX_BALLS) scene.remove(balls.shift().mesh);
  shotsFired++; if (shotsFired % (ptype.fire < 0.07 ? 2 : 1) === 0) audio.kick();
}
function ballThroughRings(b, a, c) {
  for (let i = 0; i < rings.length; i++) {
    if (b.scored.has(i)) continue;
    const r = rings[i], s0 = _bp.copy(a).sub(r.pos).dot(r.n), s1 = _bp.copy(c).sub(r.pos).dot(r.n);
    if (s0 * s1 > 0 || s0 === s1) continue;
    _bp.copy(a).lerp(c, s0 / (s0 - s1));
    if (_bp.distanceTo(r.pos) < RING_R - 1) { b.scored.add(i); scoreGoal(_bp.clone()); }
  }
}
function scoreGoal(p) {
  goals++; score += 50; burst(p, 0xffffff, 18); burst(p, 0x3ddc84, 18);
  audio.beep(784, 0.12, 'square', 0.1); audio.beep(1047, 0.12, 'square', 0.1, 0.1); audio.beep(1568, 0.3, 'square', 0.1, 0.2);
  flash('GOAL!', `Cameron scores! ${goals} goal${goals === 1 ? '' : 's'}`, 1.4);
}
function updateBalls(dt) {
  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i], m = b.mesh; b.life -= dt;
    if (b.life <= 0 || m.position.y < -60) { scene.remove(m); balls.splice(i, 1); continue; }
    _bPrev.copy(m.position);
    b.v.y -= G * dt; b.v.multiplyScalar(1 - 0.12 * dt);
    m.position.addScaledVector(b.v, dt);
    const gh = surfaceAt(m.position.x, m.position.z);
    if (m.position.y - BALL_R < gh) {
      m.position.y = gh + BALL_R;
      if (surfWater) { b.v.y = Math.max(0, -b.v.y * 0.15); b.v.multiplyScalar(1 - 3 * dt); }
      else {
        if (b.v.y < -3 && m.position.distanceTo(camera.position) < 150) audio.kick(Math.min(0.12, -b.v.y * 0.006));
        if (b.v.y < 0) { b.v.y = b.v.y < -1.5 ? -b.v.y * 0.62 : 0; b.v.x *= 0.85; b.v.z *= 0.85; }
        b.v.x *= 1 - 0.9 * dt; b.v.z *= 1 - 0.9 * dt;
        b.w = Math.hypot(b.v.x, b.v.z) / BALL_R;
      }
    }
    _bAxis.set(b.v.z, 0, -b.v.x);
    if (_bAxis.lengthSq() > 1e-6) m.rotateOnWorldAxis(_bAxis.normalize(), b.w * dt);
    if (b.life < 0.6) m.scale.setScalar(Math.max(0.01, b.life / 0.6));
    ballThroughRings(b, _bPrev, m.position);
    ballHits(b, _bPrev, m.position, gh);
  }
}

// ---------------------------------------------------------------- camera
const CAM_MODES = ['CHASE CAM', 'COCKPIT', 'FLYBY'];
// ---------------------------------------------------------------- combat
const UP = new V3(0, 1, 0), Z_AXIS = new V3(0, 0, 1), ORIGIN = new V3(), _m4 = new THREE.Matrix4(), _cq = new THREE.Quaternion();
const _sd1 = new V3(), _sd2 = new V3(), _ra = new V3(), _rb = new V3(), _o1 = new V3(), _c1 = new V3(), _c2 = new V3(), _e1 = new V3(), _e2 = new V3(), _e3 = new V3();
const framePrev = new V3();
let score = 0, banditKills = 0, banditTimer = 25, hitFlash = 0, smokeT = 0, allClear = false;

function segDist(a, b, p) {
  _sd1.copy(b).sub(a); const l2 = _sd1.lengthSq();
  const t = l2 > 0 ? clamp(_sd2.copy(p).sub(a).dot(_sd1) / l2, 0, 1) : 0;
  return _sd2.copy(a).addScaledVector(_sd1, t).distanceTo(p);
}
function hitRel(pa, ca, pb, cb, R) { _ra.copy(pa).sub(pb); _rb.copy(ca).sub(cb); return segDist(_ra, _rb, ORIGIN) < R; }
function orient(obj, pos, dir) { obj.quaternion.setFromRotationMatrix(_m4.lookAt(pos, _o1.copy(pos).add(dir), UP)); }
function smokePuff(p, size, rise) {
  const mesh = new THREE.Mesh(sphGeo, new THREE.MeshBasicMaterial({ color: 0x3a3a3a, transparent: true, depthWrite: false }));
  mesh.position.copy(p); scene.add(mesh);
  debris.push({ mesh, v: new V3((Math.random() - 0.5) * 2, rise, (Math.random() - 0.5) * 2), life: 3, max: 3, smoke: true, size, grav: 0 });
}

// ground forces
const OLIVE = new THREE.MeshStandardMaterial({ color: 0x5a6438, roughness: 0.85 }), TRACKS = new THREE.MeshStandardMaterial({ color: 0x2a2a26, roughness: 0.9 });
const BURNT = new THREE.MeshStandardMaterial({ color: 0x1c1b1a, roughness: 1 }), UNIFORM = new THREE.MeshStandardMaterial({ color: 0x4d5a30, roughness: 0.9 });
const SKIN2 = new THREE.MeshStandardMaterial({ color: 0xc08a60, roughness: 0.8 }), TENT = new THREE.MeshStandardMaterial({ color: 0x6b6a45, roughness: 0.9, flatShading: true });
const FLAG = new THREE.MeshBasicMaterial({ color: 0xd01818, side: THREE.DoubleSide });
const GEO = {
  hull: new THREE.BoxGeometry(3.6, 1.2, 6.6), track: new THREE.BoxGeometry(0.9, 1.1, 7), turret: new THREE.BoxGeometry(2.6, 0.95, 3.0),
  barrel: new THREE.CylinderGeometry(0.15, 0.15, 4.6, 8).rotateX(Math.PI / 2), leg: new THREE.BoxGeometry(0.22, 0.85, 0.26).translate(0, -0.42, 0),
  torso: new THREE.BoxGeometry(0.56, 0.72, 0.32), head: new THREE.SphereGeometry(0.17, 8, 6), helmet: new THREE.SphereGeometry(0.2, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
  rifle: new THREE.BoxGeometry(0.07, 0.07, 0.9), tent: new THREE.ConeGeometry(4, 3.5, 4), pole: new THREE.CylinderGeometry(0.08, 0.08, 9, 5), flag: new THREE.PlaneGeometry(3, 1.8),
};
function unitAdder(g, meshes) {
  return (geo, m, x, y, z, parent = g, shadow = true) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = shadow; o.userData.mat = m; parent.add(o); meshes.push(o); return o; };
}
function makeTank() {
  const g = new THREE.Group(), meshes = [], add = unitAdder(g, meshes);
  add(GEO.hull, OLIVE, 0, 1.2, 0); add(GEO.track, TRACKS, 1.9, 0.6, 0); add(GEO.track, TRACKS, -1.9, 0.6, 0);
  const turret = new THREE.Group(); turret.position.y = 2.1; g.add(turret);
  add(GEO.turret, OLIVE, 0, 0.1, 0.3, turret); add(GEO.barrel, TRACKS, 0, 0.15, -3.4, turret);
  g.scale.setScalar(1.5);
  return { g, turret, meshes };
}
function makeSoldier() {
  const g = new THREE.Group(), meshes = [], add = unitAdder(g, meshes);
  const hip = x => { const leg = new THREE.Group(); leg.position.set(x, 0.85, 0); g.add(leg); add(GEO.leg, UNIFORM, 0, 0, 0, leg, false); return leg; };
  const legL = hip(-0.15), legR = hip(0.15);
  add(GEO.torso, UNIFORM, 0, 1.2, 0, g, false); add(GEO.head, SKIN2, 0, 1.73, 0, g, false); add(GEO.helmet, UNIFORM, 0, 1.78, 0, g, false); add(GEO.rifle, TRACKS, 0.34, 1.15, -0.2, g, false);
  g.scale.setScalar(1.7);
  return { g, legL, legR, meshes };
}
const camps = [], tanks = [], troops = [], craters = [];
{
  const rng = mulberry32(31);
  for (let i = 0; i < 8000 && camps.length < 10; i++) {
    const x = (rng() - 0.5) * WORLD * 0.72, z = (rng() - 0.5) * WORLD * 0.72;
    if (Math.abs(x) < 900 && Math.abs(z) < RWY.halfL + 1200) continue;
    const h = groundHeight(x, z); if (h < 5 || h > 280) continue;
    let flat = true;
    for (const [dx, dz] of [[70, 0], [-70, 0], [0, 70], [0, -70], [100, 100], [-100, -100], [100, -100], [-100, 100]]) if (Math.abs(groundHeight(x + dx, z + dz) - h) > 16 || groundHeight(x + dx, z + dz) < 2) flat = false;
    if (!flat || camps.some(c => Math.hypot(c.x - x, c.z - z) < 1700)) continue;
    camps.push({ x, z });
  }
  for (const c of camps) {
    for (let k = 0; k < 3; k++) {
      const a = rng() * Math.PI * 2, r = 12 + rng() * 25, x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      const t = new THREE.Mesh(GEO.tent, TENT); t.position.set(x, groundHeight(x, z) + 1.6, z); t.rotation.y = rng(); t.castShadow = true; scene.add(t);
    }
    const pole = new THREE.Mesh(GEO.pole, TRACKS); pole.position.set(c.x, groundHeight(c.x, c.z) + 4.5, c.z); scene.add(pole);
    const flag = new THREE.Mesh(GEO.flag, FLAG); flag.position.set(c.x + 1.5, groundHeight(c.x, c.z) + 8, c.z); scene.add(flag);
    for (let k = 0; k < 3; k++) {
      const t = makeTank();
      Object.assign(t, { camp: c, rad: 35 + rng() * 45, ang0: rng() * Math.PI * 2, dirSign: rng() < 0.5 ? -1 : 1, spd: 2 + rng() * 2.5 });
      scene.add(t.g); tanks.push(t);
    }
    for (let k = 0; k < 8; k++) {
      const s = makeSoldier(), a = rng() * Math.PI * 2, r = 10 + rng() * 60;
      Object.assign(s, { camp: c, home: new V3(c.x + Math.cos(a) * r, 0, c.z + Math.sin(a) * r), phase: rng() * 6, pos: new V3(), target: new V3() });
      scene.add(s.g); troops.push(s);
    }
  }
}
function resetUnits() {
  for (const t of tanks) {
    Object.assign(t, { alive: true, hp: 2, ang: t.ang0, fireCd: 2 + Math.random() * 4, smoke: 0, smokeT: 0 });
    for (const m of t.meshes) m.material = m.userData.mat;
    t.turret.position.y = 2.1; t.turret.rotation.set(0, 0, 0);
  }
  for (const s of troops) { s.alive = true; s.pos.copy(s.home); s.target.copy(s.home); s.g.rotation.set(0, 0, 0); s.legL.rotation.x = s.legR.rotation.x = 0; }
  for (const c of craters) scene.remove(c); craters.length = 0;
}
function killTank(t) {
  if (!t.alive) return;
  t.alive = false; t.smoke = 30; score += 250;
  for (const m of t.meshes) m.material = BURNT;
  t.turret.position.y = 2.9; t.turret.rotation.z = 0.5;
  burst(_c1.copy(t.g.position).setY(t.g.position.y + 3), 0xff8a2b, 16);
}
function killTroop(s) {
  if (!s.alive) return;
  s.alive = false; score += 25;
  s.g.rotation.x = -Math.PI / 2; s.g.position.y = s.pos.y + 0.4;
}
function checkAllClear() {
  if (allClear || tanks.some(t => t.alive) || troops.some(s => s.alive)) return;
  allClear = true; score += 1000;
  flash('All ground targets destroyed!', 'Outstanding work, Captain Price · +1000', 4);
  audio.beep(523, 0.15, 'square', 0.1); audio.beep(659, 0.15, 'square', 0.1, 0.15); audio.beep(784, 0.15, 'square', 0.1, 0.3); audio.beep(1047, 0.4, 'square', 0.1, 0.45);
}
function updateUnits(dt) {
  const pp = state.pos, live = started && !state.crashed;
  const agl = pp.y - surfaceAt(pp.x, pp.z);
  for (const t of tanks) {
    if (t.alive) {
      t.ang += t.dirSign * t.spd / t.rad * dt;
      const x = t.camp.x + Math.cos(t.ang) * t.rad, z = t.camp.z + Math.sin(t.ang) * t.rad;
      const dx = -Math.sin(t.ang) * t.dirSign, dz = Math.cos(t.ang) * t.dirSign;
      t.g.position.set(x, groundHeight(x, z), z); t.g.rotation.y = Math.atan2(-dx, -dz);
      t.turret.rotation.y = Math.atan2(-(pp.x - x), -(pp.z - z)) - t.g.rotation.y;
      t.fireCd -= dt;
      if (live && state.wasAirborne && t.fireCd <= 0 && agl < 700) {
        const d = t.g.position.distanceTo(pp);
        if (d < 1100) { t.fireCd = 3 + Math.random() * 3; tankShoot(t, d); }
      }
    } else if (t.smoke > 0) {
      t.smoke -= dt; t.smokeT -= dt;
      if (t.smokeT <= 0) { t.smokeT = 0.35; smokePuff(_c1.copy(t.g.position).setY(t.g.position.y + 3), 2, 4); }
    }
  }
  for (const s of troops) {
    if (!s.alive) continue;
    const flee = live && agl < 300 && Math.hypot(pp.x - s.pos.x, pp.z - s.pos.z) < 350;
    if (flee) s.target.set(s.pos.x * 2 - pp.x, 0, s.pos.z * 2 - pp.z);
    else if (Math.hypot(s.target.x - s.pos.x, s.target.z - s.pos.z) < 2) s.target.set(s.camp.x + (Math.random() - 0.5) * 140, 0, s.camp.z + (Math.random() - 0.5) * 140);
    const dx = s.target.x - s.pos.x, dz = s.target.z - s.pos.z, dl = Math.hypot(dx, dz) || 1, sp = flee ? 5 : 1.4;
    s.pos.x += dx / dl * sp * dt; s.pos.z += dz / dl * sp * dt;
    const cx = s.pos.x - s.camp.x, cz = s.pos.z - s.camp.z, cr = Math.hypot(cx, cz);
    if (cr > 220) { s.pos.x = s.camp.x + cx / cr * 220; s.pos.z = s.camp.z + cz / cr * 220; if (!flee) s.target.set(s.camp.x, 0, s.camp.z); }
    s.pos.y = groundHeight(s.pos.x, s.pos.z);
    s.g.position.copy(s.pos); s.g.rotation.y = Math.atan2(-dx, -dz);
    s.phase += dt * (flee ? 13 : 7);
    const sw = Math.sin(s.phase) * 0.6; s.legL.rotation.x = sw; s.legR.rotation.x = -sw;
  }
}

// enemy fire
const tracers = [], tracerGeo = new THREE.BoxGeometry(0.3, 0.3, 7);
const TRACER_MAT = { bullet: new THREE.MeshBasicMaterial({ color: 0xffe066 }), shell: new THREE.MeshBasicMaterial({ color: 0xff7a2a }) };
function spawnTracer(p, v, dmg, kind, src) {
  const mesh = new THREE.Mesh(tracerGeo, TRACER_MAT[kind]); mesh.position.copy(p);
  if (kind === 'shell') mesh.scale.set(2.2, 2.2, 1);
  orient(mesh, p, v); scene.add(mesh);
  tracers.push({ mesh, v: v.clone(), prev: p.clone(), life: 3.5, dmg, src });
}
function tankShoot(t, d) {
  const SPEED = 240, muzzle = _c1.copy(t.g.position).setY(t.g.position.y + 3.6);
  const aim = _c2.copy(state.pos).addScaledVector(state.vel, d / SPEED).sub(muzzle).normalize();
  aim.x += (Math.random() - 0.5) * 0.05; aim.y += (Math.random() - 0.5) * 0.05; aim.z += (Math.random() - 0.5) * 0.05; aim.normalize();
  spawnTracer(muzzle, aim.multiplyScalar(SPEED), 12, 'shell', 'tank fire');
  burst(muzzle, 0xffc060, 5);
  audio.beep(90, 0.25, 'sawtooth', clamp(0.12 - d / 12000, 0.02, 0.1));
}
function updateTracers(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) {
    const t = tracers[i], m = t.mesh; t.life -= dt;
    t.prev.copy(m.position); m.position.addScaledVector(t.v, dt);
    let dead = t.life <= 0 || m.position.y < surfaceAt(m.position.x, m.position.z);
    if (!dead && !state.crashed && hitRel(t.prev, m.position, framePrev, state.pos, ptype.half * 0.55 + 1.5)) { damagePlayer(t.dmg, t.src); dead = true; }
    if (dead) { scene.remove(m); tracers.splice(i, 1); }
  }
}
function damagePlayer(n, src) {
  if (state.crashed) return;
  state.health = Math.max(0, state.health - n);
  hitFlash = Math.min(0.75, hitFlash + 0.25 + n * 0.02);
  audio.beep(140 + Math.random() * 60, 0.08, 'square', 0.12);
  if (state.health <= 0) crash('Shot down!', `Captain Price was hit by ${src}`);
}

// bombs
const bombs = [], bombGeo = new THREE.CylinderGeometry(0.3, 0.3, 2.0, 10).rotateX(Math.PI / 2), bombNose = new THREE.SphereGeometry(0.3, 8, 6), finGeo = new THREE.BoxGeometry(1.0, 0.06, 0.45);
const bombMat = new THREE.MeshStandardMaterial({ color: 0x3b4230, roughness: 0.6 });
function makeBomb() {
  const g = new THREE.Group(), b = new THREE.Mesh(bombGeo, bombMat); b.castShadow = true; g.add(b);
  const nose = new THREE.Mesh(bombNose, bombMat); nose.position.z = -1; g.add(nose);
  for (const r of [0, Math.PI / 2]) { const f = new THREE.Mesh(finGeo, bombMat); f.position.z = 0.9; f.rotation.z = r; g.add(f); }
  return g;
}
function dropBomb() {
  const s = state; if (s.crashed || s.grounded) return;
  if (s.bombs <= 0) { flash('Out of bombs', 'Land on the runway to rearm', 1.6); return; }
  s.bombs--; axes(s.q);
  const g = makeBomb(); g.position.copy(s.pos).addScaledVector(_u, -1.4); orient(g, g.position, s.vel.lengthSq() > 1 ? s.vel : _f); scene.add(g);
  bombs.push({ g, v: s.vel.clone().addScaledVector(_u, -2) });
  audio.whistle();
}
function updateBombs(dt) {
  for (let i = bombs.length - 1; i >= 0; i--) {
    const b = bombs[i], p = b.g.position;
    b.v.y -= G * dt; b.v.multiplyScalar(1 - 0.02 * dt); p.addScaledVector(b.v, dt); orient(b.g, p, b.v);
    const gh = surfaceAt(p.x, p.z), water = surfWater;
    const nearEnemy = enemies.some(e => p.distanceTo(e.pos) < 10);
    if (p.y <= gh + 0.3 || nearEnemy) {
      if (p.y < gh + 0.3) p.y = gh + 0.3;
      scene.remove(b.g); bombs.splice(i, 1); detonate(p.clone(), water && !nearEnemy);
    }
  }
}
const craterGeo = new THREE.CircleGeometry(9, 18).rotateX(-Math.PI / 2);
const craterMat = new THREE.MeshBasicMaterial({ color: 0x2a2418, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
function addCrater(p) {
  const m = new THREE.Mesh(craterGeo, craterMat); m.position.set(p.x, p.y + 0.4, p.z); scene.add(m); craters.push(m);
  if (craters.length > 40) scene.remove(craters.shift());
}
function detonate(p, water) {
  explode(p, water ? 0.35 : 0.6);
  if (water) burst(p, 0xe8f4ff, 30); else addCrater(p);
  audio.boom(clamp(1.2 - p.distanceTo(camera.position) / 1500, 0.15, 1));
  let tk = 0, tr = 0;
  for (const t of tanks) {
    if (!t.alive) continue; const d = t.g.position.distanceTo(p);
    if (d < 16) t.hp = 0; else if (d < 32) t.hp -= 1;
    if (t.hp <= 0) { killTank(t); tk++; }
  }
  for (const s of troops) if (s.alive && s.pos.distanceTo(p) < 34) { killTroop(s); tr++; }
  for (const e of [...enemies]) if (e.pos.distanceTo(p) < 28) killEnemy(e);
  if (!state.crashed && state.pos.distanceTo(p) < 35) damagePlayer(40, 'your own bomb blast');
  if (tk || tr) {
    const parts = [];
    if (tk) parts.push(`${tk} tank${tk > 1 ? 's' : ''}`); if (tr) parts.push(`${tr} soldier${tr > 1 ? 's' : ''}`);
    flash(tk ? 'Tank destroyed!' : 'Direct hit!', `${parts.join(' · ')} · +${tk * 250 + tr * 25}`, 1.8);
  }
  checkAllClear();
}
const ccip = new THREE.Mesh(new THREE.RingGeometry(5, 7, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff3b3b, transparent: true, opacity: 0.85, depthTest: false }));
ccip.renderOrder = 5; ccip.visible = false; scene.add(ccip);
function updateCCIP() {
  const s = state; ccip.visible = false;
  if (s.crashed || s.grounded || s.bombs <= 0) return;
  axes(s.q);
  const p = _c1.copy(s.pos).addScaledVector(_u, -1.4), v = _c2.copy(s.vel).addScaledVector(_u, -2);
  for (let i = 0; i < 400; i++) {
    v.y -= G * 0.05; v.multiplyScalar(0.999); p.addScaledVector(v, 0.05);
    const gh = surfaceAt(p.x, p.z);
    if (p.y <= gh) { ccip.position.set(p.x, gh + 1, p.z); ccip.scale.setScalar(clamp(p.distanceTo(camera.position) / 250, 0.6, 8)); ccip.visible = true; return; }
  }
}

// soccer balls vs targets
function ballHits(b, a, c, gh) {
  if (b.life <= 0) return;
  for (const e of enemies) {
    if (hitRel(a, c, e.prev, e.pos, ptype.half * 0.8 + 1.5)) {
      e.hp -= 25; b.life = 0; burst(c, 0xffffff, 8); audio.beep(300, 0.05, 'square', 0.08);
      if (e.hp <= 0) killEnemy(e);
      return;
    }
  }
  if (c.y - gh > 12) return;
  for (const t of tanks) {
    if (!t.alive || Math.abs(t.g.position.x - c.x) > 7 || Math.abs(t.g.position.z - c.z) > 7) continue;
    if (_c1.copy(t.g.position).setY(t.g.position.y + 2.5).distanceTo(c) < 5.5) {
      t.hp -= ptype.id === 'a10' ? 0.25 : 0.08; b.life = 0; burst(c, 0xffe0a0, 5);
      if (t.hp <= 0) { killTank(t); explode(t.g.position, 0.4); flash('Tank destroyed!', 'Soccer-ball barrage · +250', 1.6); checkAllClear(); }
      return;
    }
  }
  for (const s of troops) {
    if (!s.alive || Math.abs(s.pos.x - c.x) > 4 || Math.abs(s.pos.z - c.z) > 4) continue;
    if (_c1.copy(s.pos).setY(s.pos.y + 1.5).distanceTo(c) < 2.8) { killTroop(s); flash('Soldier down!', 'Knocked over by a soccer ball · +25', 1.2); checkAllClear(); }
  }
}

// enemy fighters
const enemies = [], BULLET = 420;
function makeEnemyMarker() {
  const d = document.createElement('div'); d.className = 'emark';
  d.innerHTML = '<div class="diamond"></div><div class="arrow"></div><div class="d"></div>';
  el.hud.appendChild(d); return d;
}
function spawnBandit() {
  const E = ptype.enemy, mdl = buildPlane(ptype, { enemy: true });
  scene.add(mdl.group);
  let a = Math.random() * Math.PI * 2, pos = new V3();
  for (let k = 0; k < 8; k++) {
    pos.set(state.pos.x + Math.sin(a) * 2800, 0, state.pos.z + Math.cos(a) * 2800);
    if (Math.abs(pos.x) < HALF * 0.85 && Math.abs(pos.z) < HALF * 0.85) break;
    a += 0.8;
  }
  pos.y = Math.max(state.pos.y + 80, surfaceAt(pos.x, pos.z) + 300);
  const dir = new V3().copy(state.pos).sub(pos).setY(0).normalize();
  enemies.push({ mdl, pos, prev: pos.clone(), dir, speed: E.speed, turn: Math.min(1.1, ptype.gLim * G / E.speed * 0.65), hp: 100, fireCd: 1, shots: 0, bank: 0, mark: makeEnemyMarker() });
  flash('Bandit inbound!', `An enemy ${E.name} is hunting Captain Price`, 2.5);
  audio.beep(520, 0.15, 'square', 0.12); audio.beep(390, 0.15, 'square', 0.12, 0.2); audio.beep(520, 0.15, 'square', 0.12, 0.4);
}
function removeEnemy(e) { scene.remove(e.mdl.group); e.mark.remove(); const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1); }
function killEnemy(e, byPlayer = true) {
  if (!enemies.includes(e)) return;
  explode(e.pos, 0.7); removeEnemy(e);
  audio.boom(clamp(1.2 - e.pos.distanceTo(camera.position) / 2000, 0.2, 1));
  banditKills++; score += byPlayer ? 500 : 250;
  flash(byPlayer ? 'Bandit down!' : 'Bandit crashed!', byPlayer ? `Captain Price splashed a ${ptype.enemy.name} · +500` : `It flew into the ground chasing you · +250`, 2.2);
}
function updateEnemies(dt) {
  const s = state;
  if (s.wasAirborne && !s.crashed) {
    banditTimer -= dt;
    if (banditTimer <= 0) { banditTimer = 40 + Math.random() * 30; if (enemies.length < 2) spawnBandit(); }
  }
  for (const e of [...enemies]) {
    e.prev.copy(e.pos);
    const toP = _e1.copy(s.pos).sub(e.pos), dist = toP.length();
    const hunting = !s.crashed && !s.grounded;
    const aim = _e2;
    if (hunting) aim.copy(s.pos).addScaledVector(s.vel, clamp(dist / (BULLET + e.speed), 0, 2.5)).sub(e.pos).normalize();
    else aim.copy(e.dir).applyAxisAngle(UP, 0.5).setY(0).normalize();
    const la = e.speed * 4, gh = Math.max(surfaceAt(e.pos.x, e.pos.z), surfaceAt(e.pos.x + e.dir.x * la, e.pos.z + e.dir.z * la));
    if (e.pos.y - gh < 180) { aim.y = Math.max(aim.y, 0.5); aim.normalize(); }
    _e3.copy(e.dir);
    const ang = Math.acos(clamp(e.dir.dot(aim), -1, 1));
    if (ang > 1e-4) e.dir.lerp(aim, Math.min(1, e.turn * dt / ang)).normalize();
    const turnY = _e3.z * e.dir.x - _e3.x * e.dir.z;
    e.bank += (clamp(-turnY / Math.max(dt, 1e-4) / e.turn, -1, 1) * 1.1 - e.bank) * Math.min(1, dt * 3);
    e.pos.addScaledVector(e.dir, e.speed * dt);
    e.mdl.group.position.copy(e.pos);
    orient(e.mdl.group, e.pos, e.dir); e.mdl.group.quaternion.multiply(_cq.setFromAxisAngle(Z_AXIS, -e.bank));
    if (e.mdl.prop) { e.mdl.prop.rotation.z += dt * 60; e.mdl.disc.material.opacity = 0.2; }
    for (const f of e.mdl.flames) f.scale.set(1, 1, 0.9 + Math.random() * 0.2);
    const facing = dist > 1 ? e.dir.dot(toP) / dist : 0;
    e.fireCd -= dt;
    if (hunting && facing > 0.992 && dist < 650 + e.speed * 1.5 && e.fireCd <= 0) {
      e.fireCd = 0.09; if (++e.shots % 14 === 0) e.fireCd = 1.6;
      const v = _e3.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.025).add(e.dir).normalize().multiplyScalar(BULLET).addScaledVector(e.dir, e.speed);
      spawnTracer(_c1.copy(e.pos).addScaledVector(e.dir, ptype.nose + 2), v, 3, 'bullet', `an enemy ${ptype.enemy.name}`);
      if (dist < 900) audio.beep(170, 0.04, 'square', 0.05);
    }
    if (e.pos.y < surfaceAt(e.pos.x, e.pos.z) + 3) { killEnemy(e, false); continue; }
    if (!s.crashed && dist < ptype.half + 4) { killEnemy(e, false); crash('Mid-air collision!'); continue; }
    if (dist > 9000) removeEnemy(e);
  }
}

function updateCombat(dt) {
  const s = state;
  updateCCIP();
  if (s.grounded && !s.crashed && s.wasAirborne && onPad(s.pos.x, s.pos.z) && s.vel.length() < 12 && (s.bombs < ptype.bombs || s.health < 100)) {
    s.bombs = ptype.bombs; s.health = 100;
    flash('Rearmed and repaired', `${ptype.bombs} bombs loaded · armor 100%`, 2.5);
    audio.beep(660, 0.1, 'square', 0.08); audio.beep(880, 0.2, 'square', 0.08, 0.12);
  }
  if (!s.crashed && s.health < 50) { smokeT -= dt; if (smokeT <= 0) { smokeT = 0.07; smokePuff(s.pos, s.health < 25 ? 1.4 : 0.8, 1); } }
}

// hangar
function renderHangar() {
  el.planes.innerHTML = TYPES.map((t, i) => `<button class="ptile${i === typeIdx ? ' sel' : ''}" data-i="${i}"><b>${i + 1}. ${t.short}</b><span>${t.era}</span><em>${Math.round(t.vmax * 1.944)} kts</em><small>${t.role}</small></button>`).join('');
  el.planeName.textContent = ptype.short.toUpperCase();
  el.tip.textContent = ptype.vtol ? 'Tip: press V to point the nozzles down and take off straight up, or roll down the runway like a normal jet.'
    : `Tip: full throttle, then pull back gently at ~${Math.round(ptype.vr * 1.944)} knots.`;
  if (!paused) el.start.textContent = started ? 'Resume' : `Fly the ${ptype.short}`;
}
function selectPlane(i) {
  if (i < 0 || i >= TYPES.length) return;
  if (i !== typeIdx) {
    typeIdx = i; ptype = TYPES[i]; localStorage.setItem('skyward_plane', String(i));
    scene.remove(plane.group); plane = buildPlane(ptype); scene.add(plane.group);
    restart();
    if (started) flash(ptype.name, `${ptype.era} · top speed ${Math.round(ptype.vmax * 1.944)} kts`, 2.5);
  }
  renderHangar();
}
function setStart(w) {
  startAt = w; localStorage.setItem('skyward_start', w);
  for (const b of el.spawn.querySelectorAll('button')) b.classList.toggle('sel', b.dataset.s === w);
  restart(); if (started) flash(w === 'carrier' ? 'USS Price, aircraft carrier' : 'Price International Airport', w === 'carrier' ? 'Full throttle to fire the catapult' : 'Runway 36', 2.5);
}
function initHangar() {
  el.spawn.addEventListener('click', ev => { const b = ev.target.closest('button'); if (b) { setStart(b.dataset.s); b.blur(); } });
  for (const b of el.spawn.querySelectorAll('button')) b.classList.toggle('sel', b.dataset.s === startAt);
  if (localStorage.getItem('skyward_keys') === '0') el.keysHud.classList.add('hidden');
  el.planes.addEventListener('click', ev => { const b = ev.target.closest('.ptile'); if (b) { selectPlane(+b.dataset.i); b.blur(); } });
  renderHangar();
}

const cam = { mode: 0, rel: new V3(0, ptype.cam[0], ptype.cam[1]), flyPos: new V3(), flySet: false };
const _cf = new V3(), _cu = new V3(), _ct = new V3();
function updateCamera(dt) {
  const s = state, q = s.q;
  _cf.set(0, 0, -1).applyQuaternion(q); _cu.set(0, 1, 0).applyQuaternion(q);
  const mode = s.crashed ? 0 : cam.mode;
  const speed = s.vel.length();
  let fov = 65;
  for (const m of plane.body) m.visible = mode !== 1;
  if (plane.prop) plane.prop.visible = plane.disc.visible = mode !== 1;
  if (mode === 0) {
    const focus = s.crashed ? crashPos : s.pos;
    if (!s.crashed) { _ct.set(0, ptype.cam[0], ptype.cam[1]).applyQuaternion(q); cam.rel.lerp(_ct, 1 - Math.exp(-dt * 4)); }
    else cam.rel.multiplyScalar(1 + dt * 0.15).setLength(Math.min(cam.rel.length(), 70));
    camera.position.copy(focus).add(cam.rel);
    const gh = surfaceAt(camera.position.x, camera.position.z);
    if (camera.position.y < gh + 2) camera.position.y = gh + 2;
    camera.up.set(0, 1, 0).lerp(_cu, s.crashed ? 0 : 0.35).normalize();
    _ct.copy(focus); if (!s.crashed) _ct.addScaledVector(_cf, 6 + ptype.nose).addScaledVector(_cu, 1.5);
    camera.lookAt(_ct);
    fov = 62 + Math.min(18, speed * 0.12);
  } else if (mode === 1) {
    camera.position.set(...ptype.cockpit).applyQuaternion(q).add(s.pos);
    camera.quaternion.copy(q);
    fov = 72;
  } else {
    const dir = speed > 5 ? _ct.copy(s.vel).normalize() : _ct.copy(_cf);
    const d = camera.position.distanceTo(s.pos);
    const passed = _tmp.copy(s.pos).sub(cam.flyPos).dot(dir) > 120;
    if (!cam.flySet || d > 450 || passed) {
      const side = Math.random() < 0.5 ? -1 : 1;
      cam.flyPos.copy(s.pos).addScaledVector(dir, Math.max(60, speed * 3.5)).add(new V3(dir.z * side * 30, 8, -dir.x * side * 30));
      cam.flyPos.y = Math.max(cam.flyPos.y, surfaceAt(cam.flyPos.x, cam.flyPos.z) + 4);
      cam.flySet = true;
    }
    camera.position.copy(cam.flyPos); camera.up.set(0, 1, 0); camera.lookAt(s.pos);
    fov = clamp(2400 / Math.max(1, camera.position.distanceTo(s.pos)), 10, 60);
  }
  camera.fov += (fov - camera.fov) * Math.min(1, dt * (mode === 2 ? 8 : 3));
  camera.updateProjectionMatrix();
  sky.position.copy(camera.position);
  sun.position.copy(s.pos).addScaledVector(sunDir, 400); sun.target.position.copy(s.pos);
}

// ---------------------------------------------------------------- HUD
const $ = id => document.getElementById(id);
const el = { spawn: $('spawn'), keysHud: $('keysHud'), vtolKey: $('vtolKey'), planes: $('planes'), planeName: $('planeName'), score: $('score'), tanks: $('tanks'), troops: $('troops'), bandits: $('bandits'), hp: $('hp'), hpFill: $('hpFill'), bombs: $('bombs'), noz: $('noz'), nozRow: $('nozRow'), hit: $('hitFlash'), tip: $('tip'), hud: $('hud'), overlay: $('overlay'), start: $('start'), speed: $('speed'), alt: $('alt'), vs: $('vs'), agl: $('agl'), thr: $('thr'), thrFill: $('throttleFill'),
  rings: $('rings'), timer: $('timer'), best: $('best'), warn: $('warn'), msg: $('msg'), hint: $('hint'), marker: $('marker'), markerDist: $('markerDist'), camMode: $('camMode'), inv: $('invState'), goals: $('goals') };
const hctx = $('horizon').getContext('2d'), cctx = $('compass').getContext('2d'), mctx = $('minimap').getContext('2d');
const fmtTime = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`; };
function updateInvLabel() { el.inv.textContent = invertPitch ? '(on)' : '(off)'; }
updateInvLabel();
let msgTimer = 0;
function showMsg(title, sub) { el.msg.innerHTML = title ? `${title}${sub ? `<small>${sub}</small>` : ''}` : ''; }
function flash(title, sub = '', secs = 1.6) { if (state.crashed) return; showMsg(title, sub); msgTimer = secs; }

const mapBase = document.createElement('canvas'); mapBase.width = mapBase.height = 180;
{
  const g = mapBase.getContext('2d'), img = g.createImageData(180, 180);
  for (let py = 0; py < 180; py++) for (let px = 0; px < 180; px++) {
    const x = -HALF + (px + 0.5) / 180 * WORLD, z = -HALF + (py + 0.5) / 180 * WORLD, h = groundHeight(x, z);
    let c;
    if (h < 0) { const t = smoothstep(-120, 0, h); c = [lerp(0.06, 0.16, t), lerp(0.22, 0.45, t), lerp(0.38, 0.62, t)]; }
    else { const sl = Math.hypot(groundHeight(x + 40, z) - groundHeight(x - 40, z), groundHeight(x, z + 40) - groundHeight(x, z - 40)) / 80; c = terrainRGB(h, sl, x, z); const shade = 0.85 + 0.3 * clamp((groundHeight(x - 40, z - 40) - h) / 60, -0.5, 0.5); c = c.map(v => clamp(v * shade, 0, 1)); }
    const i = (py * 180 + px) * 4; img.data[i] = c[0] * 255; img.data[i + 1] = c[1] * 255; img.data[i + 2] = c[2] * 255; img.data[i + 3] = 235;
  }
  g.putImageData(img, 0, 0);
  g.fillStyle = '#d8dde3'; g.fillRect((CAR.x + HALF) / WORLD * 180 - 2, (CAR.z - CAR.halfL + HALF) / WORLD * 180, 4, CAR.halfL * 2 / WORLD * 180 + 1);
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(90, 90 - RWY.halfL / WORLD * 180); g.lineTo(90, 90 + RWY.halfL / WORLD * 180); g.stroke();
}
const toMap = (x, z) => [(x + HALF) / WORLD * 180, (z + HALF) / WORLD * 180];

function drawMinimap(hdg) {
  mctx.clearRect(0, 0, 180, 180); mctx.drawImage(mapBase, 0, 0);
  rings.forEach((r, i) => {
    if (i < race.next) return; const [x, y] = toMap(r.pos.x, r.pos.z);
    mctx.fillStyle = i === race.next ? '#ffc933' : 'rgba(127,224,255,.85)';
    mctx.beginPath(); mctx.arc(x, y, i === race.next ? 4 : 2.2, 0, Math.PI * 2); mctx.fill();
  });
  mctx.fillStyle = '#ff3b3b';
  for (const t of tanks) if (t.alive) { const [x, y] = toMap(t.g.position.x, t.g.position.z); mctx.fillRect(x - 2, y - 2, 4, 4); }
  for (const e of enemies) {
    const [x, y] = toMap(e.pos.x, e.pos.z);
    mctx.save(); mctx.translate(x, y); mctx.rotate(Math.atan2(e.dir.x, -e.dir.z));
    mctx.strokeStyle = '#000'; mctx.lineWidth = 1; mctx.beginPath(); mctx.moveTo(0, -6); mctx.lineTo(4.5, 5); mctx.lineTo(-4.5, 5); mctx.closePath(); mctx.fill(); mctx.stroke(); mctx.restore();
  }
  const [px, py] = toMap(state.pos.x, state.pos.z);
  mctx.save(); mctx.translate(px, py); mctx.rotate(hdg);
  mctx.fillStyle = '#ff5a3c'; mctx.strokeStyle = '#fff'; mctx.lineWidth = 1.5;
  mctx.beginPath(); mctx.moveTo(0, -7); mctx.lineTo(5, 6); mctx.lineTo(0, 3); mctx.lineTo(-5, 6); mctx.closePath(); mctx.fill(); mctx.stroke();
  mctx.restore();
}

function drawHorizon(pitch, bank) {
  const W = 160, c = W / 2, ppd = 2.6;
  hctx.save(); hctx.clearRect(0, 0, W, W);
  hctx.beginPath(); hctx.arc(c, c, c - 1, 0, Math.PI * 2); hctx.clip();
  hctx.translate(c, c); hctx.rotate(-bank); hctx.translate(0, pitch * 180 / Math.PI * ppd);
  hctx.fillStyle = '#3d8fd8'; hctx.fillRect(-200, -400, 400, 400);
  hctx.fillStyle = '#8a5a2e'; hctx.fillRect(-200, 0, 400, 400);
  hctx.strokeStyle = '#fff'; hctx.lineWidth = 2; hctx.beginPath(); hctx.moveTo(-200, 0); hctx.lineTo(200, 0); hctx.stroke();
  hctx.lineWidth = 1.2; hctx.fillStyle = '#fff'; hctx.font = '9px monospace'; hctx.textAlign = 'right';
  for (let d = -60; d <= 60; d += 10) { if (!d) continue; const y = -d * ppd, w = d % 20 ? 12 : 22; hctx.beginPath(); hctx.moveTo(-w, y); hctx.lineTo(w, y); hctx.stroke(); if (!(d % 20)) hctx.fillText(Math.abs(d), -w - 3, y + 3); }
  hctx.restore();
  hctx.strokeStyle = '#ffb02e'; hctx.lineWidth = 3; hctx.beginPath(); hctx.moveTo(c - 38, c); hctx.lineTo(c - 12, c); hctx.lineTo(c - 6, c + 7); hctx.moveTo(c + 38, c); hctx.lineTo(c + 12, c); hctx.lineTo(c + 6, c + 7); hctx.stroke();
  hctx.fillStyle = '#ffb02e'; hctx.beginPath(); hctx.arc(c, c, 2.5, 0, Math.PI * 2); hctx.fill();
}

function drawCompass(hdgDeg) {
  const W = 360, H = 40, ppd = 3;
  cctx.clearRect(0, 0, W, H);
  cctx.strokeStyle = 'rgba(200,240,255,.85)'; cctx.fillStyle = '#e8f6ff'; cctx.textAlign = 'center'; cctx.font = 'bold 12px monospace';
  for (let d = Math.floor(hdgDeg - 60); d <= hdgDeg + 60; d++) {
    if (d % 5) continue; const x = W / 2 + (d - hdgDeg) * ppd, dd = ((d % 360) + 360) % 360;
    cctx.beginPath(); cctx.moveTo(x, H - 4); cctx.lineTo(x, H - (dd % 15 ? 9 : 15)); cctx.stroke();
    if (dd % 30 === 0) { const lbl = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[dd] ?? String(dd / 10).padStart(2, '0'); cctx.fillStyle = 'NESW'.includes(lbl) ? '#ffd27f' : '#e8f6ff'; cctx.fillText(lbl, x, 15); }
  }
  cctx.fillStyle = '#ffc933'; cctx.beginPath(); cctx.moveTo(W / 2 - 6, 0); cctx.lineTo(W / 2 + 6, 0); cctx.lineTo(W / 2, 7); cctx.fill();
}

const _mk = new V3(), RUNWAY_TARGET = new V3(0, RWY.h, RWY.halfL);
function placeMarker(node, arrow, distEl, target, label) {
  _mk.copy(target).applyMatrix4(camera.matrixWorldInverse);
  const behind = _mk.z > 0;
  _mk.copy(target).project(camera);
  let x = _mk.x, y = _mk.y; if (behind) { x = -x; y = -y; }
  const lim = 0.86, on = !behind && Math.abs(x) < lim && Math.abs(y) < lim;
  if (!on) { const m = Math.max(Math.abs(x), Math.abs(y), 1e-6); x = x / m * lim; y = y / m * lim; }
  node.classList.toggle('edge', !on);
  if (!on) arrow.style.transform = `rotate(${Math.atan2(-y, x)}rad)`;
  node.style.display = 'block';
  node.style.left = ((x * 0.5 + 0.5) * innerWidth) + 'px';
  node.style.top = ((-y * 0.5 + 0.5) * innerHeight) + 'px';
  const dist = state.pos.distanceTo(target);
  distEl.textContent = `${label} · ${dist > 1000 ? (dist / 1000).toFixed(1) + ' km' : Math.round(dist) + ' m'}`;
}
const markerArrow = document.querySelector('#marker .arrow');
function updateMarker() {
  let target = null, label = '';
  if (!state.crashed) {
    if (race.next < RING_COUNT && state.wasAirborne) { target = rings[race.next].pos; label = `RING ${race.next + 1}`; }
    else if (race.done && !race.landedAfter) { target = RUNWAY_TARGET; label = 'RUNWAY'; }
  }
  if (!target) el.marker.style.display = 'none';
  else placeMarker(el.marker, markerArrow, el.markerDist, target, label);
  for (const e of enemies) {
    if (state.crashed) { e.mark.style.display = 'none'; continue; }
    placeMarker(e.mark, e.mark.children[1], e.mark.children[2], e.pos, 'BANDIT');
  }
}

let stallBeep = 0;
function updateHUD(dt) {
  const s = state; axes(s.q);
  const speed = s.vel.length(), agl = s.pos.y - GEAR - surfaceAt(s.pos.x, s.pos.z);
  const hdg = Math.atan2(_f.x, -_f.z), hdgDeg = ((hdg * 180 / Math.PI) + 360) % 360;
  const pitch = Math.asin(clamp(_f.y, -1, 1)), bank = Math.atan2(-_r.y, _u.y);
  el.speed.textContent = Math.round(speed * 1.944);
  el.alt.textContent = Math.round(s.pos.y * 3.281).toLocaleString();
  el.vs.textContent = Math.round(s.vel.y * 196.85 / 10) * 10;
  el.agl.textContent = Math.max(0, Math.round(agl * 3.281)).toLocaleString();
  el.thr.textContent = Math.round(s.throttle * 100); el.thrFill.style.width = (s.throttle * 100) + '%';
  el.rings.textContent = `${race.next} / ${RING_COUNT}`;
  el.timer.textContent = fmtTime(race.time);
  el.best.textContent = best ? fmtTime(best) : '—';
  el.goals.textContent = goals;
  el.score.textContent = score.toLocaleString();
  el.tanks.textContent = `${tanks.reduce((n, t) => n + !t.alive, 0)} / ${tanks.length}`;
  el.troops.textContent = `${troops.reduce((n, t) => n + !t.alive, 0)} / ${troops.length}`;
  el.bandits.textContent = banditKills;
  el.hp.textContent = Math.round(s.health); el.hpFill.style.width = s.health + '%';
  el.hpFill.style.background = s.health > 60 ? '#38d39f' : s.health > 30 ? '#ffd24a' : '#ff4a4a';
  el.bombs.textContent = `${s.bombs} / ${ptype.bombs}`;
  el.nozRow.style.display = el.vtolKey.style.display = ptype.vtol ? '' : 'none'; el.noz.textContent = Math.round(s.nozzle * 83);
  el.hit.style.opacity = hitFlash; hitFlash = Math.max(0, hitFlash - dt * 1.5);
  el.camMode.textContent = CAM_MODES[cam.mode];
  drawHorizon(pitch, bank); drawCompass(hdgDeg); drawMinimap(hdg); updateMarker();

  let warn = '';
  if (!s.crashed && !s.grounded) {
    if (s.aoa > STALL - 0.03 && speed > 5 && s.hover < 0.3) warn = 'STALL';
    else if (agl < 120 && s.vel.y < -12 && agl / -s.vel.y < 5) warn = 'PULL UP';
    else if (enemies.some(e => { _tmp.copy(e.pos).sub(s.pos); const d = _tmp.length(); return d < 1200 && _tmp.dot(_f) < -0.4 * d; })) warn = 'BANDIT 6 O\'CLOCK';
  }
  if (el.warn.textContent !== warn) el.warn.textContent = warn;
  stallBeep -= dt; if (warn && stallBeep <= 0) { audio.beep(warn === 'STALL' ? 620 : warn === 'PULL UP' ? 480 : 880, 0.12, 'square', 0.08); stallBeep = 0.4; }

  let hint = '';
  if (!s.crashed && s.grounded && !s.wasAirborne) {
    if (ptype.vtol && s.nozzleTarget === 0 && s.throttle < 0.95) hint = 'Hold <kbd>Shift</kbd> for full throttle, or press <kbd>V</kbd> to take off vertically';
    else if (ptype.vtol && s.nozzleTarget === 1) hint = 'Hover mode: throttle up past ~75% to lift off, <kbd>V</kbd> to go forward';
    else if (s.throttle < 0.95) hint = 'Hold <kbd>Shift</kbd> for full throttle';
    else if (speed < ptype.vr * 0.95) hint = `Rolling… rotate at ~${Math.round(ptype.vr * 1.944)} knots`;
    else hint = invertPitch ? 'Pull up: hold <kbd>W</kbd> / <kbd>↑</kbd>' : 'Pull up: hold <kbd>S</kbd> / <kbd>↓</kbd>';
  } else if (!s.crashed && !s.grounded && shotsFired === 0 && s.airTime > 4) {
    hint = 'Hold <kbd>Space</kbd> to fire soccer balls, <kbd>X</kbd> to drop bombs on the red camps';
  } else if (race.done && !race.landedAfter && s.grounded && speed < 2 && !s.crashed) {
    race.landedAfter = true;
    flash(onPad(s.pos.x, s.pos.z) ? 'Mission complete, Captain Price!' : 'Landed… somewhere', `Course time ${fmtTime(race.time)} · press R to fly again`, 8);
  }
  if (el.hint.innerHTML !== hint) el.hint.innerHTML = hint;

  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0 && !s.crashed) showMsg('', ''); }
}

// ---------------------------------------------------------------- loop
let started = false, paused = false, last = performance.now();
function setPaused(p) {
  paused = p; el.overlay.classList.toggle('hidden', !p); el.start.textContent = p ? 'Resume' : `Fly the ${ptype.short}`;
  if (!p) audio.init(); else audio.update(0, 0, false);
}
el.start.addEventListener('click', () => { audio.init(); if (!started) { started = true; el.hud.classList.remove('hidden'); } setPaused(false); canvas.focus(); });

function simUpdate(dt, t) {
  framePrev.copy(state.pos);
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  for (let i = 0; i < n; i++) step(dt / n);
  if (race.started && !race.done && !state.crashed) race.time += dt;
  plane.group.position.copy(state.pos); plane.group.quaternion.copy(state.q);
  if (plane.prop) {
    plane.prop.rotation.z += dt * (8 + state.throttle * 70);
    plane.disc.material.opacity = state.throttle > 0.15 ? 0.12 + state.throttle * 0.12 : 0;
  }
  for (const nz of plane.nozzles) nz.rotation.x = state.nozzle * 1.45;
  const ab = ptype.id === 'f15' && state.throttle > 0.95 ? 1.7 : 1;
  for (const f of plane.flames) { const k = state.throttle < 0.05 ? 0.001 : (0.25 + state.throttle * 0.9) * ab * (0.9 + Math.random() * 0.2); f.scale.set(Math.min(1.3, 0.6 + k * 0.4), Math.min(1.3, 0.6 + k * 0.4), k); }
  const pulse = 1 + Math.sin(t / 180) * 0.06;
  if (race.next < RING_COUNT) rings[race.next].mesh.scale.setScalar(pulse);
  if (input.fire && !state.crashed) { fireCd -= dt; while (fireCd <= 0) { fireBall(); fireCd += ptype.fire; } }
  else fireCd = 0;
  updateEnemies(dt);
  updateTracers(dt);
  updateBombs(dt);
  updateUnits(dt);
  updateBalls(dt);
  updateDebris(dt);
  updateCombat(dt);
  updatePAPI(); updateRabbits(t); if (CAR.radar) CAR.radar.rotation.y += dt * 1.5;
  audio.update(state.throttle, state.vel.length(), !state.crashed, !plane.prop);
  updateHUD(dt);
}
function frame(t) {
  requestAnimationFrame(frame);
  const dt = Math.min((t - last) / 1000, 0.05); last = t;
  if (started && !paused) {
    simUpdate(dt, t);
  } else if (!started) {
    const a = t / 9000;
    const R = 26 + ptype.half * 4;
    camera.position.set(state.pos.x + Math.sin(a) * R + 6, state.pos.y + 3.1 + ptype.half, state.pos.z + Math.cos(a) * R);
    camera.up.set(0, 1, 0); camera.lookAt(state.pos);
    sky.position.copy(camera.position);
    sun.position.copy(state.pos).addScaledVector(sunDir, 400); sun.target.position.copy(state.pos);
    plane.group.position.copy(state.pos); plane.group.quaternion.copy(state.q);
    updateUnits(dt);
    renderer.render(scene, camera); return;
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
document.addEventListener('visibilitychange', () => { if (document.hidden && started) setPaused(true); });

initHangar();
restart();
requestAnimationFrame(frame);
window.sim = { V3, CAR, state, input, race, rings, restart, groundHeight, step, balls, fireBall, TYPES, selectPlane, dropBomb, spawnBandit, enemies, tanks, troops, camps, bombs, tracers, damagePlayer, get ptype() { return ptype; },
  advance(sec, h = 1 / 60) { let t = performance.now(); for (let k = 0; k < sec / h; k++) { t += h * 1000; simUpdate(h, t); } }, get goals() { return goals; }, get score() { return score; }, get banditKills() { return banditKills; } };
