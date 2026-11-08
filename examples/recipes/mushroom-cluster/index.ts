import { Box3, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { AssetBuild } from '../../../src/catalog/types.ts';
import { facetedLoft } from '../../../src/engine/geometry.ts';
import type { Control, Design, Preset } from '../../../src/engine/parameters.ts';
import { parameterState, parseControls, plainRecord } from '../../../src/engine/parameters.ts';
import type { Recipe } from '../../../src/recipes/types.ts';

const palettes: Record<string, { label: string, cap: string, spots: string, stem: string, ground: string }> = {
  toadstool: { label: 'Toadstool', cap: '#c8352b', spots: '#f4efe2', stem: '#ece4d0', ground: '#4d6b3a' },
  porcini: { label: 'Porcini', cap: '#7a4a2a', spots: '#9a6a44', stem: '#e2d3b0', ground: '#5b6b3a' },
  glow: { label: 'Glow', cap: '#2f6fb3', spots: '#9ef3ff', stem: '#cfe3ea', ground: '#2f4a3a' },
};
const controls: Control[] = [
  { key: 'count', label: 'Mushrooms', kind: 'integer', group: 'construction', unit: 'count', min: 1, max: 9, step: 1, default: 5, hint: 'Mushrooms in the clump.', affects: ['topology'], targets: ['cap', 'stem'] },
  { key: 'height', label: 'Tallest', kind: 'range', group: 'shape', unit: 'm', min: 0.1, max: 2.5, step: 0.05, default: 0.35, hint: 'Height of the tallest mushroom.', affects: ['geometry'], targets: ['cap', 'stem'] },
  { key: 'capStyle', label: 'Caps', kind: 'choice', group: 'construction', unit: 'none', default: 'dome', options: [{ value: 'dome', label: 'Dome' }, { value: 'flat', label: 'Bun' }, { value: 'cone', label: 'Cone' }], hint: 'Cap shape.', affects: ['geometry'], targets: ['cap'] },
  { key: 'capWidth', label: 'Cap width', kind: 'range', group: 'shape', unit: 'ratio', min: 0.4, max: 1.2, step: 0.05, default: 0.75, hint: 'Cap width relative to height.', affects: ['geometry'], targets: ['cap'] },
  { key: 'spots', label: 'Spots', kind: 'toggle', group: 'construction', unit: 'none', default: true, hint: 'Raised spots on the caps.', affects: ['geometry'], targets: ['spots'] },
  { key: 'lean', label: 'Lean', kind: 'range', group: 'shape', unit: 'ratio', min: 0, max: 0.4, step: 0.01, default: 0.15, hint: 'How far the outer mushrooms lean out.', affects: ['geometry'], targets: ['stem'] },
  { key: 'seed', label: 'Variation seed', kind: 'integer', group: 'construction', unit: 'seed', min: 0, max: 65535, step: 1, default: 7, hint: 'Repeatable layout.', affects: ['geometry'], targets: ['cap', 'stem'] },
  { key: 'colorway', label: 'Palette', kind: 'choice', group: 'colors', unit: 'none', default: 'toadstool', options: Object.entries(palettes).map(([value, p]) => ({ value, label: p.label })), hint: 'Mushroom colors.', affects: ['material'], targets: ['cap', 'spots', 'stem', 'ground'] },
  { key: 'color.cap', label: 'Cap', kind: 'color', group: 'colors', unit: 'color', default: palettes.toadstool!.cap, role: 'cap', hint: 'Cap color.', affects: ['material'], targets: ['cap'] },
  { key: 'color.spots', label: 'Spots', kind: 'color', group: 'colors', unit: 'color', default: palettes.toadstool!.spots, role: 'spots', hint: 'Spot color.', affects: ['material'], targets: ['spots'] },
  { key: 'color.stem', label: 'Stem', kind: 'color', group: 'colors', unit: 'color', default: palettes.toadstool!.stem, role: 'stem', hint: 'Stem and gill color.', affects: ['material'], targets: ['stem'] },
  { key: 'color.ground', label: 'Moss', kind: 'color', group: 'colors', unit: 'color', default: palettes.toadstool!.ground, role: 'ground', hint: 'Moss mound color.', affects: ['material'], targets: ['ground'] },
];
const roles = ['cap', 'spots', 'stem', 'gills', 'ground'] as const;
type Role = typeof roles[number];
function save(input: unknown): Design {
  const requested = { ...plainRecord(input) };
  const applied = parseControls(controls, requested);
  const palette = palettes[String(applied.colorway)] ?? palettes.toadstool!;
  for (const key of ['cap', 'spots', 'stem', 'ground'] as const) if (!Object.hasOwn(requested, 'color.' + key)) applied['color.' + key] = palette[key];
  return { formatVersion: 1, family: 'mushroom-cluster', familyVersion: '2.0.0', requested, applied };
}
function load(input: unknown): Design {
  const value = plainRecord(input);
  if (value.formatVersion !== 1 || value.family !== 'mushroom-cluster') throw new Error('Unsupported mushroom design');
  return save(plainRecord(value.requested));
}
function rng(seed: number): () => number { let s = (seed * 2654435761 + 7) >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
const ring = (r: number, sides: number, phase: number, squash = 1): Array<[number, number]> => Array.from({ length: sides }, (_, i) => { const t = phase + i * Math.PI * 2 / sides; return [Math.cos(t) * r, Math.sin(t) * r * squash]; });
const profiles: Record<string, Array<[number, number]>> = {
  dome: [[0.97, 0], [1, 0.12], [0.93, 0.38], [0.74, 0.66], [0.44, 0.9], [0.14, 1]],
  flat: [[0.94, 0], [1, 0.18], [0.96, 0.48], [0.78, 0.8], [0.4, 0.97], [0.12, 1]],
  cone: [[1, 0], [0.82, 0.22], [0.58, 0.48], [0.34, 0.74], [0.14, 0.94], [0.05, 1]],
};
function build(input: unknown): AssetBuild {
  const config = save(input), p = config.applied, random = rng(Number(p.seed))
  const count = Number(p.count), tall = Number(p.height), widthRatio = Number(p.capWidth), lean = Number(p.lean), style = String(p.capStyle)
  const profile = profiles[style] ?? profiles.dome!, capTall = style === 'flat' ? 0.45 : style === 'cone' ? 0.85 : 0.6
  const parts: Record<Role, BufferGeometry[]> = { cap: [], spots: [], stem: [], gills: [], ground: [] }
  const items: Array<{ x: number, z: number, h: number }> = []
  for (let i = 0; i < count; i++) {
    const h = tall * (i === 0 ? 1 : 0.45 + random() * 0.4), angle = i * 2.39996 + random() * 0.5, d = i === 0 ? 0 : tall * widthRatio * (0.45 + 0.22 * Math.sqrt(i))
    items.push({ x: Math.cos(angle) * d, z: Math.sin(angle) * d, h })
  }
  let reach = 0
  for (const [i, m] of items.entries()) {
    const capR = m.h * widthRatio * 0.5, capH = capR * capTall, stemH = m.h - capH, stemR = capR * (style === 'flat' ? 0.42 : 0.24)
    const dist = Math.hypot(m.x, m.z), ux = dist ? m.x / dist : 0, uz = dist ? m.z / dist : 0, tilt = i === 0 ? 0 : lean * stemH
    const bend = (t: number) => tilt * t * t
    const stem = [0, 0.3, 0.7, 1].map((t, k) => ({ center: [m.x + ux * bend(t), t * stemH, m.z + uz * bend(t)] as [number, number, number], outline: ring(stemR * [1.25, 1, 0.92, 0.85][k]!, 7, random() * 0, 1) }))
    parts.stem.push(facetedLoft(stem))
    const top = stem.at(-1)!.center, phase = random() * Math.PI, sides = 10
    parts.gills.push(facetedLoft([{ center: [top[0], top[1] - capH * 0.06, top[2]], outline: ring(stemR * 1.1, sides, phase) }, { center: [top[0], top[1] - 0.001, top[2]], outline: ring(capR * 0.9, sides, phase) }], { bottom: true, top: false }))
    parts.cap.push(facetedLoft(profile.map(([r, y]) => ({ center: [top[0], top[1] + y * capH, top[2]] as [number, number, number], outline: ring(capR * r, sides, phase) }))))
    if (p.spots === true) for (let k = 0; k < 6; k++) {
      const pi = 1 + Math.floor(random() * (profile.length - 2)), [r, y] = profile[pi]!, a = random() * Math.PI * 2, sr = capR * (0.09 + random() * 0.05)
      const cx = top[0] + Math.cos(a) * capR * r * 0.97, cz = top[2] + Math.sin(a) * capR * r * 0.97, cy = top[1] + y * capH
      parts.spots.push(facetedLoft([{ center: [cx, cy - sr * 0.6, cz], outline: ring(sr, 5, a) }, { center: [cx, cy + sr * 0.25, cz], outline: ring(sr * 0.8, 5, a) }]))
    }
    reach = Math.max(reach, dist + tilt + capR)
  }
  const R = Math.max(reach * 0.85, tall * 0.35), groundH = Math.min(0.06, tall * 0.08)
  parts.ground.push(facetedLoft([{ center: [0, 0, 0], outline: ring(R, 9, 0.3, 0.9) }, { center: [0, groundH * 0.6, 0], outline: ring(R * 0.92, 9, 0.5, 0.9) }, { center: [0, groundH, 0], outline: ring(R * 0.55, 9, 0.7, 0.9) }]))
  const glow = String(p.colorway) === 'glow'
  const color: Record<Role, string> = { cap: String(p['color.cap']), spots: String(p['color.spots']), stem: String(p['color.stem']), gills: String(p['color.stem']), ground: String(p['color.ground']) }
  const materials = Object.fromEntries(roles.map(role => [role, new MeshStandardMaterial({ name: role, color: color[role], roughness: 0.85, metalness: 0, flatShading: true, ...(glow && role === 'spots' ? { emissive: color.spots, emissiveIntensity: 0.8 } : {}) })]))
  materials.gills!.color.multiplyScalar(0.82)
  const root = new Group(); root.name = 'mushroom-cluster'
  for (const role of roles) {
    if (!parts[role].length) continue
    const positions: number[] = []
    for (const g of parts[role]) positions.push(...(g.getAttribute('position').array as Float32Array))
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals()
    const mesh = new Mesh(geometry, materials[role]); mesh.name = role; mesh.userData.materialRole = role === 'gills' ? 'stem' : role; mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh)
  }
  root.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(root, true), dimensions = bounds.getSize(new Vector3())
  const anchors = { ground: [0, 0, 0], top: [0, dimensions.y, 0] }
  root.userData = { configuration: config, units: 'meters', up: '+Y', forward: '+Z', origin: 'ground-center', anchors }
  return { root, config, materials, anchors, bounds, dimensions }
}
const presets: Preset[] = [
  { id: 'toadstool', name: 'Toadstools', description: 'Red spotted toadstools on a moss mound.', parameters: {} },
  { id: 'porcini', name: 'Porcini', description: 'Fat-stemmed porcini with brown bun caps.', parameters: { colorway: 'porcini', capStyle: 'flat', spots: false, count: 4, capWidth: 0.95, lean: 0.08, seed: 12 } },
  { id: 'glow', name: 'Giant glowcap', description: 'Tall blue glowcaps with glowing spots.', parameters: { colorway: 'glow', capStyle: 'cone', height: 1.9, count: 5, capWidth: 0.6, lean: 0.22, seed: 31 } },
];
export const mushroomRecipe: Recipe = {
  descriptor: {
    id: 'mushroom-cluster', version: '2.0.0', title: 'Mushroom cluster', description: 'A clump of faceted mushrooms on a moss mound, with dome, bun or cone caps.',
    controls, defaults: parseControls(controls, {}), presets,
    palettes: Object.entries(palettes).map(([id, pal]) => ({ id, label: pal.label, colors: [pal.cap, pal.stem], parameters: { 'color.cap': pal.cap, 'color.spots': pal.spots, 'color.stem': pal.stem, 'color.ground': pal.ground } })),
    save, state: input => parameterState(controls, input),
  },
  build, load, validationCases: [...presets], integrationCases: [{ id: 'toadstool', name: 'Toadstools', parameters: {} }],
  constraints: ['Each stem, cap, gill disc and spot is a closed faceted loft on the moss mound.'],
  presentation: { category: 'Nature', order: 166, kitIds: [] },
  source: { entry: 'examples/recipes/mushroom-cluster/index.ts', exportName: 'mushroomRecipe' },
};
