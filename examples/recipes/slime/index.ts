import { Box3, BufferAttribute, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { AssetBuild } from '../../../src/catalog/types.ts';
import { facetedLoft } from '../../../src/engine/geometry.ts';
import { SculptBody, type SculptRGB } from '../../../src/engine/sculpt/body.ts';
import type { Control, Design, Preset } from '../../../src/engine/parameters.ts';
import { parameterState, parseControls, plainRecord } from '../../../src/engine/parameters.ts';
import type { Recipe } from '../../../src/recipes/types.ts';

const colorRoles = ['body', 'shine', 'eye', 'pupil', 'accent', 'glow'] as const;
type ColorRole = typeof colorRoles[number];
const palettes: Record<string, { label: string } & Record<ColorRole, string>> = {
  lime: { label: 'Lime', body: '#6fcf4f', shine: '#c9f5a8', eye: '#fbfbf6', pupil: '#1f2a24', accent: '#3d8a3a', glow: '#ff8fa3' },
  azure: { label: 'Azure', body: '#3f8ee0', shine: '#bfe0ff', eye: '#fbfbf6', pupil: '#1b2233', accent: '#f0c445', glow: '#e8344f' },
  magma: { label: 'Magma', body: '#ff6a1a', shine: '#ffd06a', eye: '#fff3c4', pupil: '#2a1410', accent: '#3a302c', glow: '#ffb020' },
};
const roleHints: Record<ColorRole, string> = { body: 'Jelly body and drips.', shine: 'Highlights and bubbles.', eye: 'Eye whites.', pupil: 'Pupils, brows and mouth.', accent: 'Leaf sprout, crown or rock crust.', glow: 'Gems, cheeks and lava cracks.' };
const controls: Control[] = [
  { key: 'height', label: 'Height', kind: 'range', group: 'shape', unit: 'm', min: 0.3, max: 1.4, step: 0.01, default: 0.7, hint: 'Ground to tip.', affects: ['geometry'], targets: ['body'] },
  { key: 'width', label: 'Width', kind: 'range', group: 'shape', unit: 'ratio', min: 0.6, max: 1.6, step: 0.01, default: 0.9, hint: 'Body diameter as a multiple of height.', affects: ['geometry'], targets: ['body'] },
  { key: 'form', label: 'Form', kind: 'choice', group: 'construction', unit: 'none', default: 'drop', options: [{ value: 'drop', label: 'Dew drop' }, { value: 'dome', label: 'Dome' }, { value: 'lumpy', label: 'Lumpy' }], hint: 'Pointed drop with a curled tip, a wide jelly dome, or a lumpy multi-lobed blob.', affects: ['geometry'], targets: ['body'] },
  { key: 'mood', label: 'Mood', kind: 'choice', group: 'construction', unit: 'none', default: 'happy', options: [{ value: 'happy', label: 'Happy' }, { value: 'sleepy', label: 'Sleepy' }, { value: 'angry', label: 'Angry' }], hint: 'Eyes and mouth.', affects: ['geometry'], targets: ['eye', 'pupil'] },
  { key: 'eyeSize', label: 'Eye size', kind: 'range', group: 'shape', unit: 'ratio', min: 0.08, max: 0.2, step: 0.005, default: 0.13, hint: 'Eye radius as a fraction of height.', affects: ['geometry'], targets: ['eye', 'pupil'] },
  { key: 'crown', label: 'Crown', kind: 'toggle', group: 'construction', unit: 'none', default: false, hint: 'A little gold crown on top.', affects: ['topology'], targets: ['accent', 'glow'] },
  { key: 'crust', label: 'Rock crust', kind: 'toggle', group: 'construction', unit: 'none', default: false, hint: 'Cooled rock plates with glowing cracks.', affects: ['geometry'], targets: ['accent', 'glow'] },
  { key: 'seed', label: 'Variation seed', kind: 'integer', group: 'construction', unit: 'seed', min: 0, max: 65535, step: 1, default: 7, hint: 'Repeatable lobes, drips and plates.', affects: ['geometry'], targets: ['body'] },
  { key: 'colorway', label: 'Palette', kind: 'choice', group: 'colors', unit: 'none', default: 'lime', options: Object.entries(palettes).map(([value, p]) => ({ value, label: p.label })), hint: 'Slime colors.', affects: ['material'], targets: [...colorRoles] },
  ...colorRoles.map((role): Control => ({ key: 'color.' + role, label: role[0]!.toUpperCase() + role.slice(1), kind: 'color', group: 'colors', unit: 'color', default: palettes.lime![role], role, hint: roleHints[role], affects: ['material'], targets: [role] })),
];
function save(input: unknown): Design {
  const requested = { ...plainRecord(input) };
  const applied = parseControls(controls, requested);
  const palette = palettes[String(applied.colorway)] ?? palettes.lime!;
  for (const role of colorRoles) if (!Object.hasOwn(requested, 'color.' + role)) applied['color.' + role] = palette[role];
  return { formatVersion: 1, family: 'slime', familyVersion: '2.0.0', requested, applied };
}
function load(input: unknown): Design {
  const value = plainRecord(input);
  if (value.formatVersion !== 1 || value.family !== 'slime') throw new Error('Unsupported slime design');
  return save(plainRecord(value.requested));
}
function rng(seed: number): () => number { let s = (seed * 2654435761 + 11) >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const rgb = (hex: string): SculptRGB => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255].map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4) as SculptRGB; };
const mix = (a: SculptRGB, b: SculptRGB, t: number): SculptRGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const same = (a: ArrayLike<number>, i: number, b: SculptRGB) => Math.abs(a[i]! - b[0]) < 1e-3 && Math.abs(a[i + 1]! - b[1]) < 1e-3 && Math.abs(a[i + 2]! - b[2]) < 1e-3;
const ring = (r: number, sides: number, phase: number): Array<[number, number]> => Array.from({ length: sides }, (_, i) => { const t = phase + i * Math.PI * 2 / sides; return [Math.cos(t) * r, Math.sin(t) * r]; });

function splitByColor(geometry: BufferGeometry, pick: (colors: ArrayLike<number>, corner: number) => boolean): [BufferGeometry, BufferGeometry] {
  const position = geometry.getAttribute('position').array, color = geometry.getAttribute('color').array;
  const out = [{ p: [] as number[], c: [] as number[] }, { p: [] as number[], c: [] as number[] }];
  for (let f = 0; f < position.length / 9; f++) {
    const target = out[pick(color, f * 9) ? 1 : 0]!;
    for (let k = 0; k < 9; k++) { target.p.push(position[f * 9 + k]!); target.c.push(color[f * 9 + k]!); }
  }
  return out.map(part => { const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(part.p, 3)); g.setAttribute('color', new Float32BufferAttribute(part.c, 3)); g.computeVertexNormals(); return g; }) as [BufferGeometry, BufferGeometry];
}

function build(input: unknown): AssetBuild {
  const config = save(input), p = config.applied, random = rng(Number(p.seed));
  const h = Number(p.height), r = h * Number(p.width) / 2, form = String(p.form), mood = String(p.mood), eye = h * Number(p.eyeSize);
  const crust = p.crust === true, crown = p.crown === true;
  const c = Object.fromEntries(colorRoles.map(role => [role, rgb(String(p['color.' + role]))])) as Record<ColorRole, SculptRGB>;
  const deep = mix(c.body, [0, 0, 0], 0.22);
  const plates = Array.from({ length: 26 }, () => { const y = random() * 1.6 - 0.6, a = random() * Math.PI * 2, s = Math.sqrt(1 - y * y); return new Vector3(Math.cos(a) * s, y, Math.sin(a) * s); });
  const center = new Vector3(0, h * 0.4, 0);
  const crack = h * 0.028;
  const faceWindow = (d: Vector3) => d.z > 0.35 && Math.abs(d.x) < 0.8 && d.y < 0.62;
  const bodyPaint = (pt: Vector3, n: Vector3): SculptRGB => {
    if (crust && pt.y > h * 0.2) {
      const dir = pt.clone().sub(center).normalize();
      if (faceWindow(dir)) return c.body;
      let d1 = Infinity, d2 = Infinity;
      for (const q of plates) { const d = dir.distanceTo(q); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; }
      const gap = (d2 - d1) * h * 0.5;
      if (gap < crack * (pt.y < h * 0.32 ? 1.6 : 1)) return c.glow;
      return pt.y < h * 0.3 && n.y < 0.3 ? c.body : c.accent;
    }
    if (pt.y < h * 0.08) return deep;
    return n.y < -0.2 ? mix(c.body, deep, 0.6) : c.body;
  };
  const sculpt = new SculptBody({ bone: 0, paint: bodyPaint, detail: 1, blend: h * 0.07 });
  const body = sculpt.root;
  body.ellipsoid('puddle', new Vector3(0, h * 0.08, 0), [r * 1.08, h * 0.12, r * 1.02]);
  if (form === 'drop') {
    body.ellipsoid('belly', new Vector3(0, h * 0.34, 0), [r * 0.94, h * 0.32, r * 0.9]);
    body.limb('point', [new Vector3(0, h * 0.5, -r * 0.02), new Vector3(0, h * 0.8, -r * 0.06), new Vector3(0, h * 0.93, r * 0.04)], [r * 0.7, r * 0.26, r * 0.1]);
    body.limb('curl', [new Vector3(0, h * 0.93, r * 0.04), new Vector3(0, h * 0.97, r * 0.17), new Vector3(0, h * 0.93, r * 0.27)], [r * 0.1, r * 0.08, r * 0.065]);
  } else if (form === 'dome') {
    body.ellipsoid('dome', new Vector3(0, h * 0.42, 0), [r * 0.98, h * 0.5, r * 0.94]);
    body.ellipsoid('brow', new Vector3(0, h * 0.62, r * 0.12), [r * 0.7, h * 0.3, r * 0.7]);
  } else {
    body.ellipsoid('core', new Vector3(0, h * 0.4, 0), [r * 0.86, h * 0.4, r * 0.82]);
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4 + random() * 0.8 + 0.6, y = h * (0.45 + random() * 0.32), lr = r * (0.38 + random() * 0.14);
      body.ellipsoid('lobe' + i, new Vector3(Math.cos(a) * r * 0.48, y, Math.sin(a) * r * 0.42 - r * 0.08), [lr, lr * 0.9, lr]);
    }
    body.ellipsoid('crest', new Vector3(r * 0.06, h * 0.8, -r * 0.05), [r * 0.36, h * 0.18, r * 0.34]);
  }
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3 + random() * 0.6;
    body.ellipsoid('rim' + i, new Vector3(Math.cos(a) * r * 1.02, h * 0.04, Math.sin(a) * r * 0.98), [r * (0.2 + random() * 0.1), h * 0.06, r * (0.2 + random() * 0.1)]);
  }
  for (let i = 0; i < 3; i++) {
    const a = 0.5 + i * 2.1 + random() * 0.5, x = Math.cos(a), z = Math.sin(a);
    body.limb('drip' + i, [new Vector3(x * r * 0.72, h * 0.42, z * r * 0.68), new Vector3(x * r * 0.94, h * 0.2, z * r * 0.9)], [r * 0.07, r * 0.13]);
  }
  const face = new Vector3(0, form === 'drop' ? h * 0.36 : h * 0.42, 0);
  const seat = (x: number, y: number) => body.surface(face, new Vector3(x, y, 1), h * 2);
  const glowFaces: SculptRGB[] = [c.glow];
  for (const side of [1, -1]) {
    const dir = new Vector3(side * 0.36, 0.14, 1).normalize(), at = seat(dir.x, dir.y);
    if (mood === 'sleepy') {
      body.decal('eye' + side, at, dir, [{ radius: eye * 0.42, paint: c.pupil }], { up: new Vector3(0, 1, 0), stretch: 2.4, segments: 12, detail: 4 });
    } else {
      const white = mood === 'angry' ? eye * 0.85 : eye;
      body.decal('eye' + side, at, dir, [{ radius: white, paint: c.eye }, { radius: white * 0.5, paint: c.pupil }], { up: new Vector3(0, 1, 0), stretch: mood === 'angry' ? 1.15 : 0.9, segments: 14, detail: 4 });
      body.paint('glint' + side, at.clone().addScaledVector(new Vector3(-0.45, 0.6, 0), white * 0.4), [white * 0.2, white * 0.2, white * 0.6], { forward: dir, paint: c.eye, detail: 4 });
    }
    if (mood === 'angry') {
      const brow = at.clone().add(new Vector3(side * eye * 0.05, eye * 0.78, 0)), tilt = new Vector3(side, 0.55, 0).normalize();
      body.paint('brow' + side, brow, [eye * 1.15, eye * 0.38, eye * 1.2], { forward: dir, up: new Vector3(0, 0, 0).crossVectors(dir, tilt).normalize(), paint: c.pupil, detail: 4 });
    } else {
      const cheek = seat(side * 0.62, -0.08);
      body.paint('cheek' + side, cheek, [eye * 0.55, eye * 0.32, eye * 0.6], { forward: new Vector3(side * 0.62, -0.08, 1).normalize(), paint: c.glow, detail: 3 });
    }
  }
  const mouthDir = new Vector3(0, mood === 'angry' ? -0.12 : -0.1, 1).normalize(), mouthAt = seat(0, mouthDir.y);
  if (mood === 'happy') body.decal('mouth', mouthAt, mouthDir, [{ radius: eye * 0.3, paint: c.pupil }, { radius: eye * 0.13, paint: c.glow }], { up: new Vector3(0, 1, 0), stretch: 1.9, segments: 12, detail: 4 });
  else if (mood === 'angry') body.decal('mouth', mouthAt, mouthDir, [{ radius: eye * 0.3, paint: c.pupil }, { radius: eye * 0.13, paint: c.glow }], { up: new Vector3(0, 1, 0), stretch: 3.4, segments: 12, detail: 4 });
  else body.decal('mouth', mouthAt, mouthDir, [{ radius: eye * 0.2, paint: c.pupil }], { up: new Vector3(0, 1, 0), stretch: 1, segments: 10, detail: 4 });
  if (!crust) {
    const hiDir = new Vector3(-0.55, 0.75, 0.45).normalize(), hi = body.surface(center, hiDir, h * 2);
    body.paint('shine', hi, [r * 0.2, r * 0.09, r * 0.3], { forward: hiDir, up: new Vector3(0.6, 0.4, 0).normalize(), paint: c.shine, detail: 3 });
    body.paint('shine2', hi.clone().add(new Vector3(r * 0.2, -h * 0.05, r * 0.08)), [r * 0.06, r * 0.06, r * 0.2], { forward: hiDir, paint: c.shine, detail: 3 });
    for (let i = 0; i < 4; i++) {
      const d = new Vector3(random() * 2 - 1, random() * 0.6 - 0.1, random() * 2 - 1).normalize();
      if (d.z > 0.4 && Math.abs(d.x) < 0.6) d.z = -d.z;
      body.paint('bubble' + i, body.surface(center, d, h * 2), [r * 0.05, r * 0.05, r * 0.05], { paint: c.shine, detail: 3 });
    }
  }
  if (crust) {
    for (const [i, q] of plates.entries()) {
      if (q.y < -0.1 || faceWindow(q) || i % 3 === 2) continue;
      const at = body.surface(center, q, h * 2), size = r * (0.16 + random() * 0.08);
      body.attach('plate' + i, { paint: c.accent, join: h * 0.01, blend: h * 0.008, detail: 2 }).ellipsoid('rock', at.clone().addScaledVector(q, -size * 0.15), [size, size * 0.38, size * 0.9], { up: q, forward: new Vector3(q.z, 0, -q.x).normalize().add(new Vector3(0, 0.001, 0)) });
    }
  }
  if (!crown && !crust && form === 'drop') {
    const tip = new Vector3(0, h * 0.93, -r * 0.02), sprout = body.attach('sprout', { paint: c.accent, join: h * 0.01, blend: h * 0.01, detail: 3 });
    const stemEnd = tip.clone().add(new Vector3(r * 0.03, h * 0.09, -r * 0.04)), leafDir = new Vector3(1, 0.45, -0.25).normalize();
    sprout.limb('stem', [tip, stemEnd], [r * 0.035, r * 0.03]);
    sprout.ellipsoid('leaf', stemEnd.clone().addScaledVector(leafDir, r * 0.12), [r * 0.07, r * 0.03, r * 0.15], { forward: leafDir });
  }
  const result = sculpt.build({ triangles: crust ? 3400 : 2600, cell: h * 0.011, floor: 0, jitter: 0.02 });
  const t = result.topology;
  if (t.shells < 1 || t.boundaryEdges || t.windingErrors) throw new Error('Slime body is not a closed surface (' + JSON.stringify(t) + ')');
  const full = result.geometry();
  full.deleteAttribute('skinIndex'); full.deleteAttribute('skinWeight');
  const [plain, lit] = splitByColor(full.toNonIndexed(), (colors, i) => glowFaces.some(g => same(colors, i, g)));
  const roughness = crust ? 0.6 : 0.28;
  const materials: Record<string, MeshStandardMaterial> = {
    body: new MeshStandardMaterial({ name: 'body', color: '#ffffff', vertexColors: true, roughness, metalness: 0, flatShading: true }),
    glow: new MeshStandardMaterial({ name: 'glow', color: '#ffffff', vertexColors: true, roughness: 0.4, metalness: 0, flatShading: true, emissive: String(p['color.glow']), emissiveIntensity: crust ? 1.1 : 0.35 }),
  };
  const root = new Group(); root.name = 'slime';
  const add = (geometry: BufferGeometry, role: string) => { if (!geometry.getAttribute('position').count) return; const mesh = new Mesh(geometry, materials[role]); mesh.name = 'slime-' + role; mesh.userData.materialRole = role; mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh); };
  add(plain, 'body'); add(lit, 'glow');
  if (crown) {
    let top = 0; const pos = plain.getAttribute('position').array;
    for (let i = 0; i < pos.length; i += 3) if (Math.hypot(pos[i]!, pos[i + 2]!) < r * 0.2) top = Math.max(top, pos[i + 1]!);
    const cr = r * 0.44, base = top - h * 0.035, band = h * 0.11, sides = 10, gold: BufferGeometry[] = [], gems: BufferGeometry[] = [];
    gold.push(facetedLoft([{ center: [0, base, 0], outline: ring(cr, sides, 0) }, { center: [0, base + band, 0], outline: ring(cr * 1.06, sides, 0) }], { bottom: true, top: true }));
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5, x = Math.cos(a) * cr * 0.96, z = Math.sin(a) * cr * 0.96;
      gold.push(facetedLoft([{ center: [x, base + band * 0.9, z], outline: ring(cr * 0.2, 4, a) }, { center: [x * 1.04, base + band * 2.1, z * 1.04], outline: ring(cr * 0.02, 4, a) }], { bottom: true, top: true }));
      const gx = Math.cos(a + Math.PI / 5) * cr * 1.07, gz = Math.sin(a + Math.PI / 5) * cr * 1.07, gs = cr * 0.1;
      gems.push(facetedLoft([{ center: [gx, base + band * 0.5 - gs, gz], outline: ring(gs * 0.05, 4, 0) }, { center: [gx, base + band * 0.5, gz], outline: ring(gs, 4, 0) }, { center: [gx, base + band * 0.5 + gs, gz], outline: ring(gs * 0.05, 4, 0) }], { bottom: true, top: true }));
    }
    materials.accent = new MeshStandardMaterial({ name: 'accent', color: String(p['color.accent']), roughness: 0.35, metalness: 0.5, flatShading: true });
    materials.gem = new MeshStandardMaterial({ name: 'gem', color: String(p['color.glow']), roughness: 0.2, metalness: 0, flatShading: true, emissive: String(p['color.glow']), emissiveIntensity: 0.5 });
    const merge = (list: BufferGeometry[]) => { const out: number[] = []; for (const g of list) out.push(...(g.getAttribute('position').array as Float32Array)); const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(out, 3)); geometry.computeVertexNormals(); return geometry; };
    const gm = new Mesh(merge(gold), materials.accent); gm.name = 'crown'; gm.userData.materialRole = 'accent'; gm.castShadow = true; root.add(gm);
    const jm = new Mesh(merge(gems), materials.gem); jm.name = 'crown-gems'; jm.userData.materialRole = 'glow'; root.add(jm);
  }
  root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(root, true), dimensions = bounds.getSize(new Vector3());
  const anchors = { ground: [0, 0, 0], top: [0, dimensions.y, 0] };
  root.userData = { configuration: config, units: 'meters', up: '+Y', forward: '+Z', origin: 'ground-center', anchors };
  return { root, config, materials, anchors, bounds, dimensions };
}
void BufferAttribute;
const presets: Preset[] = [
  { id: 'dew', name: 'Dew slime', description: 'Green happy dew drop with a curled tip and a leaf sprout.', parameters: {} },
  { id: 'king', name: 'King slime', description: 'Wide sleepy blue dome wearing a gold crown.', parameters: { height: 0.95, width: 1.45, form: 'dome', mood: 'sleepy', eyeSize: 0.14, crown: true, colorway: 'azure', seed: 11 } },
  { id: 'magma', name: 'Magma blob', description: 'Lumpy angry lava blob under cooled rock plates with glowing cracks.', parameters: { height: 0.8, width: 1.05, form: 'lumpy', mood: 'angry', eyeSize: 0.11, crust: true, colorway: 'magma', seed: 29 } },
];
export const slimeRecipe: Recipe = {
  descriptor: {
    id: 'slime', version: '2.0.0', title: 'Slime creature', description: 'A jelly slime sculpted as one closed body, with a puddled base, drips, expressive eyes and mouth, and an optional crown or rock crust.',
    controls, defaults: parseControls(controls, {}), presets,
    palettes: Object.entries(palettes).map(([id, pal]) => ({ id, label: pal.label, colors: [pal.body, pal.shine], parameters: Object.fromEntries(colorRoles.map(role => ['color.' + role, pal[role]])) })),
    save, state: input => parameterState(controls, input),
  },
  build, load, validationCases: [...presets], integrationCases: [{ id: 'dew', name: 'Dew slime', parameters: {} }],
  constraints: ['Eyes and mouth sit on the front (+Z) of one closed sculpted body.'],
  presentation: { category: 'Characters', order: 476, kitIds: [] },
  source: { entry: 'examples/recipes/slime/index.ts', exportName: 'slimeRecipe' },
};
