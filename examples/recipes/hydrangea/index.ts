import { Box3, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { AssetBuild } from '../../../src/catalog/types.ts';
import type { StoneCut } from '../../../src/engine/convex-stone.ts';
import { buildFacetStone } from '../../../src/engine/sculpt/facet.ts';
import type { Control, Design, Preset } from '../../../src/engine/parameters.ts';
import { parameterState, parseControls, plainRecord } from '../../../src/engine/parameters.ts';
import type { Recipe } from '../../../src/recipes/types.ts';

const palettes: Record<string, { label: string, foliage: string, shade: string, accent: string, ground: string }> = {
  blue: { label: 'Blue', foliage: '#4f8a4a', shade: '#33643a', accent: '#7f9be6', ground: '#5a4532' },
  pink: { label: 'Pink', foliage: '#4f8a4a', shade: '#33643a', accent: '#e58fb4', ground: '#5a4532' },
  white: { label: 'White', foliage: '#4a8246', shade: '#2f5c36', accent: '#eeeadb', ground: '#5a4532' },
};
const controls: Control[] = [
  { key: 'width', label: 'Width', kind: 'range', group: 'shape', unit: 'm', min: 0.6, max: 2.4, step: 0.05, default: 1.3, hint: 'Spread of the bush.', affects: ['geometry'], targets: ['leaves', 'flowers'] },
  { key: 'height', label: 'Height', kind: 'range', group: 'shape', unit: 'm', min: 0.5, max: 2, step: 0.05, default: 1.1, hint: 'Height of the bush.', affects: ['geometry'], targets: ['leaves', 'flowers'] },
  { key: 'mounds', label: 'Leaf mounds', kind: 'integer', group: 'construction', unit: 'count', min: 3, max: 9, step: 1, default: 6, hint: 'Overlapping leaf masses.', affects: ['topology'], targets: ['leaves'] },
  { key: 'flowers', label: 'Flower heads', kind: 'integer', group: 'construction', unit: 'count', min: 0, max: 30, step: 1, default: 16, hint: 'Round flower clusters on the outside.', affects: ['topology'], targets: ['flowers'] },
  { key: 'seed', label: 'Variation seed', kind: 'integer', group: 'construction', unit: 'seed', min: 0, max: 65535, step: 1, default: 21, hint: 'Repeatable layout and facets.', affects: ['geometry'], targets: ['leaves', 'flowers'] },
  { key: 'colorway', label: 'Palette', kind: 'choice', group: 'colors', unit: 'none', default: 'blue', options: Object.entries(palettes).map(([value, p]) => ({ value, label: p.label })), hint: 'Flower and leaf colors.', affects: ['material'], targets: ['leaves', 'flowers'] },
  { key: 'color.foliage', label: 'Leaves', kind: 'color', group: 'colors', unit: 'color', default: palettes.blue!.foliage, role: 'leaves', hint: 'Upper leaf color.', affects: ['material'], targets: ['leaves'] },
  { key: 'color.shade', label: 'Shaded leaves', kind: 'color', group: 'colors', unit: 'color', default: palettes.blue!.shade, role: 'shade', hint: 'Lower leaf color.', affects: ['material'], targets: ['shade'] },
  { key: 'color.accent', label: 'Flowers', kind: 'color', group: 'colors', unit: 'color', default: palettes.blue!.accent, role: 'flowers', hint: 'Flower head color.', affects: ['material'], targets: ['flowers'] },
  { key: 'color.ground', label: 'Soil', kind: 'color', group: 'colors', unit: 'color', default: palettes.blue!.ground, role: 'ground', hint: 'Soil mound color.', affects: ['material'], targets: ['ground'] },
];
function save(input: unknown): Design {
  const requested = { ...plainRecord(input) };
  const applied = parseControls(controls, requested);
  const palette = palettes[String(applied.colorway)] ?? palettes.blue!;
  for (const [key, value] of [['color.foliage', palette.foliage], ['color.shade', palette.shade], ['color.accent', palette.accent], ['color.ground', palette.ground]] as const) if (!Object.hasOwn(requested, key)) applied[key] = value;
  return { formatVersion: 1, family: 'hydrangea', familyVersion: '1.0.0', requested, applied };
}
function load(input: unknown): Design {
  const value = plainRecord(input);
  if (value.formatVersion !== 1 || value.family !== 'hydrangea') throw new Error('Unsupported hydrangea design');
  return save(plainRecord(value.requested));
}
function rng(seed: number): () => number {
  let state = (seed * 2654435761 + 1) >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
function blobCuts(random: () => number, sides: number, rows: number, roughness: number): StoneCut[] {
  const center = new Vector3(0, 0.75, 0), cuts: StoneCut[] = [];
  for (let row = 0; row < rows; row++) {
    const elevation = -0.25 + row / Math.max(1, rows - 1) * 1.15, count = Math.max(3, Math.round(sides * Math.cos(Math.min(elevation, 1.2))))
    for (let i = 0; i < count; i++) {
      const azimuth = (i + row * 0.5 + (random() - 0.5) * 0.4) * Math.PI * 2 / count
      const n = new Vector3(Math.cos(azimuth) * Math.cos(elevation), Math.sin(elevation), Math.sin(azimuth) * Math.cos(elevation)).normalize()
      cuts.push({ normal: [n.x, n.y, n.z], limit: n.dot(center) + 0.55 * (1 + (random() - 0.5) * roughness) })
    }
  }
  cuts.push({ normal: [0, 1, 0], limit: center.y + 0.55 * (1 + (random() - 0.5) * roughness * 0.5) })
  cuts.push({ normal: [0, -1, 0], limit: 0 })
  return cuts
}
type Entry = { name: string, role: 'leaves' | 'shade' | 'flowers' | 'ground', positions: number[] };
function place(entries: Entry[], name: string, role: Entry['role'], solid: ReturnType<typeof buildFacetStone>, x: number, y: number, z: number) {
  const positions: number[] = []
  for (const part of solid.parts) for (let k = 0; k < part.positions.length; k += 3) positions.push(part.positions[k]! + x, part.positions[k + 1]! + y, part.positions[k + 2]! + z)
  entries.push({ name, role, positions })
}
function build(input: unknown): AssetBuild {
  const config = save(input), p = config.applied
  const width = Number(p.width), height = Number(p.height), mounds = Number(p.mounds), flowers = Number(p.flowers)
  const random = rng(Number(p.seed))
  const entries: Entry[] = []
  const soil = buildFacetStone(blobCuts(random, 9, 2, 0.15), { width: width * 0.86, height: Math.min(0.08, height * 0.08), depth: width * 0.78, moss: 0, yaw: random() * Math.PI })
  place(entries, 'soil', 'ground', soil, 0, 0, 0)
  const masses: Array<{ x: number, z: number, w: number, d: number, h: number, base: number }> = []
  masses.push({ x: 0, z: 0, w: Math.max(width * 0.68, height * 0.75), d: Math.max(width * 0.62, height * 0.7), h: height, base: 0 })
  for (let i = 1; i < mounds; i++) {
    const angle = i * 2.39996 + random() * 0.4, ring = width * (0.17 + random() * 0.09)
    const w = width * (0.38 + random() * 0.14)
    masses.push({ x: Math.cos(angle) * ring, z: Math.sin(angle) * ring * 0.9, w, d: w * (0.85 + random() * 0.2), h: height * (0.55 + random() * 0.25), base: 0 })
  }
  masses.forEach((m, i) => {
    const solid = buildFacetStone(blobCuts(random, 8, 4, 0.22), { width: m.w, height: m.h, depth: m.d, moss: 0, yaw: random() * Math.PI * 2 })
    place(entries, 'leaves-' + i, i === 0 || m.h > height * 0.7 ? 'leaves' : 'shade', solid, m.x, m.base, m.z)
  })
  const surface = (m: typeof masses[number], azimuth: number, elevation: number) => new Vector3(
    m.x + Math.cos(azimuth) * Math.cos(elevation) * m.w * 0.44,
    m.base + m.h * (0.5 + 0.47 * Math.sin(elevation)),
    m.z + Math.sin(azimuth) * Math.cos(elevation) * m.d * 0.44)
  const heads: Vector3[] = []
  for (let tries = 0; heads.length < flowers && tries < flowers * 40; tries++) {
    const m = masses[Math.floor(random() * masses.length)]!
    const point = surface(m, random() * Math.PI * 2, 0.15 + random() * 1.05)
    const radius = Math.min(width, height) * 0.1
    if (masses.some(o => o !== m && Math.hypot((point.x - o.x) / (o.w * 0.44), (point.z - o.z) / (o.d * 0.44)) < 0.8 && point.y < o.base + o.h * 0.85)) continue
    if (heads.some(h => h.distanceTo(point) < radius * 1.9)) continue
    heads.push(point)
  }
  heads.forEach((point, i) => {
    const r = Math.min(width, height) * (0.085 + random() * 0.03)
    const solid = buildFacetStone(blobCuts(random, 6, 3, 0.2), { width: r * 2, height: r * 1.7, depth: r * 2, moss: 0, yaw: random() * Math.PI * 2 })
    place(entries, 'flower-' + i, 'flowers', solid, point.x, Math.max(0, point.y - r * 0.75), point.z)
  })
  const materials = Object.fromEntries((['leaves', 'shade', 'flowers', 'ground'] as const).map(role => {
    const key = role === 'leaves' ? 'color.foliage' : role === 'shade' ? 'color.shade' : role === 'flowers' ? 'color.accent' : 'color.ground'
    return [role, new MeshStandardMaterial({ name: role, color: String(p[key]), roughness: 0.92, metalness: 0, flatShading: true })]
  }))
  const root = new Group(); root.name = 'hydrangea'
  for (const entry of entries) {
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(entry.positions, 3)); geometry.computeVertexNormals()
    const mesh = new Mesh(geometry, materials[entry.role]); mesh.name = entry.name; mesh.userData.materialRole = entry.role; mesh.castShadow = true; mesh.receiveShadow = true
    root.add(mesh)
  }
  root.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(root, true)
  if (Math.abs(bounds.min.y) > 1e-3) throw new Error('Hydrangea is not grounded (' + bounds.min.y + ')')
  const dimensions = bounds.getSize(new Vector3())
  const anchors = { ground: [0, 0, 0], top: [0, dimensions.y, 0] }
  root.userData = { configuration: config, units: 'meters', up: '+Y', forward: '+Z', origin: 'ground-center', anchors }
  return { root, config, materials, anchors, bounds, dimensions }
}
const presets: Preset[] = [
  { id: 'blue', name: 'Blue hydrangea', description: 'Round green bush with blue flower heads.', parameters: {} },
  { id: 'pink', name: 'Pink hydrangea', description: 'Wide pink bush with many heads.', parameters: { colorway: 'pink', width: 1.6, height: 1.05, mounds: 7, flowers: 22, seed: 5 } },
  { id: 'white', name: 'White hydrangea', description: 'Tall white bush.', parameters: { colorway: 'white', width: 1.25, height: 1.2, mounds: 6, flowers: 14, seed: 88 } },
];
export const hydrangeaRecipe: Recipe = {
  descriptor: {
    id: 'hydrangea', version: '1.0.0', title: 'Hydrangea', description: 'Faceted flowering bush with leaf mounds, round flower heads and a soil base.',
    controls, defaults: parseControls(controls, {}), presets,
    palettes: Object.entries(palettes).map(([id, palette]) => ({ id, label: palette.label, colors: [palette.foliage, palette.accent], parameters: { 'color.foliage': palette.foliage, 'color.shade': palette.shade, 'color.accent': palette.accent, 'color.ground': palette.ground } })),
    save, state: input => parameterState(controls, input),
  },
  build, load,
  validationCases: [...presets],
  integrationCases: [{ id: 'blue', name: 'Blue', parameters: {} }],
  constraints: ['Every leaf mound and flower head is a closed flat-faced solid on or above y = 0.'],
  presentation: { category: 'Nature', order: 165, kitIds: [] },
  source: { entry: 'examples/recipes/hydrangea/index.ts', exportName: 'hydrangeaRecipe' },
};
