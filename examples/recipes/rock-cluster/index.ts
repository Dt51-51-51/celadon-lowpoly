import { Box3, BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { AssetBuild } from '../../../src/catalog/types.ts';
import type { StoneCut } from '../../../src/engine/convex-stone.ts';
import { buildFacetStone, buildLoftStone } from '../../../src/engine/sculpt/facet.ts';
import type { FacetedStation } from '../../../src/engine/geometry.ts';
import type { Control, Design, Preset } from '../../../src/engine/parameters.ts';
import { parameterState, parseControls, plainRecord } from '../../../src/engine/parameters.ts';
import type { Recipe } from '../../../src/recipes/types.ts';

const palettes: Record<string, { label: string, stone: string, accent: string }> = {
  granite: { label: 'Granite', stone: '#8d8a85', accent: '#6f6b66' },
  sandstone: { label: 'Sandstone', stone: '#c2a077', accent: '#a07f58' },
  basalt: { label: 'Basalt', stone: '#45474b', accent: '#5c5e62' },
  mossy: { label: 'Mossy', stone: '#7f8478', accent: '#5d7343' },
};
const controls: Control[] = [
  { key: 'count', label: 'Rocks', kind: 'integer', group: 'construction', unit: 'count', min: 1, max: 9, step: 1, default: 5, hint: 'Main stones in the cluster.', affects: ['topology'], targets: ['rock', 'pebble'] },
  { key: 'size', label: 'Largest rock', kind: 'range', group: 'shape', unit: 'm', min: 0.3, max: 3, step: 0.05, default: 1.2, hint: 'Height of the largest stone.', affects: ['geometry'], targets: ['rock', 'pebble'] },
  { key: 'spread', label: 'Spread', kind: 'range', group: 'shape', unit: 'ratio', min: 0.6, max: 2, step: 0.05, default: 1.1, hint: 'How far stones spread from the center, relative to size.', affects: ['geometry'], targets: ['rock', 'pebble'] },
  { key: 'flatness', label: 'Flatness', kind: 'range', group: 'shape', unit: 'ratio', min: 0.3, max: 1.2, step: 0.05, default: 0.7, hint: 'Height to width of each stone. Low values make slabs.', affects: ['geometry'], targets: ['rock', 'pebble'] },
  { key: 'pebbles', label: 'Pebbles', kind: 'integer', group: 'construction', unit: 'count', min: 0, max: 12, step: 1, default: 6, hint: 'Small grounded stones around the cluster.', affects: ['topology'], targets: ['pebble'] },
  { key: 'seed', label: 'Variation seed', kind: 'integer', group: 'construction', unit: 'seed', min: 0, max: 65535, step: 1, default: 101, hint: 'Repeatable facets and layout.', affects: ['geometry'], targets: ['rock', 'pebble'] },
  { key: 'colorway', label: 'Palette', kind: 'choice', group: 'colors', unit: 'none', default: 'granite', options: Object.entries(palettes).map(([value, palette]) => ({ value, label: palette.label })), hint: 'Stone and moss colors.', affects: ['material'], targets: ['stone', 'moss'] },
  { key: 'color.stone', label: 'Stone', kind: 'color', group: 'colors', unit: 'color', default: palettes.granite!.stone, role: 'stone', hint: 'Main stone color.', affects: ['material'], targets: ['stone'] },
  { key: 'color.accent', label: 'Moss', kind: 'color', group: 'colors', unit: 'color', default: palettes.granite!.accent, role: 'moss', hint: 'Moss and weathered caps.', affects: ['material'], targets: ['moss'] },
];
function save(input: unknown): Design {
  const requested = { ...plainRecord(input) };
  const applied = parseControls(controls, requested);
  const palette = palettes[String(applied.colorway)] ?? palettes.granite!;
  if (!Object.hasOwn(requested, 'color.stone')) applied['color.stone'] = palette.stone;
  if (!Object.hasOwn(requested, 'color.accent')) applied['color.accent'] = palette.accent;
  return { formatVersion: 1, family: 'rock-cluster', familyVersion: '1.2.0', requested, applied };
}
function load(input: unknown): Design {
  const value = plainRecord(input);
  if (value.formatVersion !== 1 || value.family !== 'rock-cluster') throw new Error('Unsupported rock cluster design');
  return save(plainRecord(value.requested));
}
function rng(seed: number): () => number {
  let state = (seed + 1) >>> 0;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
function nuggetCuts(seed: number): StoneCut[] {
  const random = rng(seed);
  const cuts: StoneCut[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 2 / 5 + (random() - 0.5) * 0.3;
    cuts.push({ normal: [Math.cos(angle), 0.2, Math.sin(angle)], limit: 0.56 + (random() - 0.5) * 0.04 });
  }
  cuts.push({ normal: [0.18, 1, 0.08], limit: 0.98 });
  cuts.push({ normal: [-0.22, 1, -0.06], limit: 1.05 });
  cuts.push({ normal: [0, -1, 0], limit: 0 });
  return cuts;
}
function moundCuts(seed: number, broad: boolean): StoneCut[] {
  const random = rng(seed);
  const angularity = broad ? 0.28 : 0.42;
  const crest = 0.05 + random() * 0.08;
  const shoulder = broad ? 0.18 : 0.32;
  const sides = broad ? 5 : 7;
  const cuts: StoneCut[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = i * Math.PI * 2 / sides + 0.13 + 0.1 * Math.sin(i * 1.8);
    const dx = Math.cos(angle), dz = Math.sin(angle);
    const radius = 0.51 + (random() - 0.5) * (0.06 + angularity * 0.08);
    cuts.push({ normal: [dx, 0.23 + 0.16 * Math.sin(i * 1.7 + 0.4), dz], limit: radius + 0.1 + 0.035 * Math.sin(i * 2.3) });
    cuts.push({ normal: [dx, 0.57 + 0.21 * Math.sin(i * 2.1 + 0.7), dz], limit: radius + 0.27 + shoulder * 0.13 + 0.09 * Math.sin(i * 1.3) });
    if (!broad) cuts.push({ normal: [dx, -0.47 - 0.22 * Math.cos(i * 1.9), dz], limit: radius - 0.065 + 0.025 * Math.sin(i) });
  }
  cuts.push({ normal: [-0.07 - crest * 0.2, 1, 0.055], limit: broad ? 0.72 : 1.01 });
  cuts.push({ normal: [0, -1, 0], limit: 0 });
  return cuts;
}
interface Placed {
  name: string;
  x: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  seed: number;
  yaw: number;
  lean: number;
  moss: number;
  flatness: number;
  pebble: boolean;
}
function reachOf(stone: Placed): number {
  return (stone.width + stone.depth) * 0.23;
}
function separate(stones: Placed[], start: number): void {
  for (let pass = 0; pass < 14; pass++) {
    for (let i = 0; i < stones.length; i++) for (let j = Math.max(i + 1, start); j < stones.length; j++) {
      const a = stones[i]!, b = stones[j]!;
      if (i < start && j < start) continue;
      let dx = b.x - a.x, dz = b.z - a.z;
      let dist = Math.hypot(dx, dz);
      const need = (reachOf(a) + reachOf(b)) * (a.pebble || b.pebble ? 0.92 : 0.9);
      if (dist >= need) continue;
      if (dist < 1e-4) { dx = Math.cos(j); dz = Math.sin(j + 1); dist = Math.hypot(dx, dz); }
      const push = (need - dist) / (i < start ? 1 : 2);
      const ux = dx / dist, uz = dz / dist;
      if (i >= start) { a.x -= ux * push; a.z -= uz * push; }
      b.x += ux * (i < start ? push : push); b.z += uz * push;
    }
  }
}
function forgeRandom(seed: number): () => number {
  let state = (seed >>> 0) ^ 0x9e3779b9;
  return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
}
function stoneOutline(rx: number, rz: number, sides: number, phase: number, jitter: number, random: () => number): Array<[number, number]> {
  const wobble = Math.min(jitter, 0.9);
  return Array.from({ length: sides }, (_, index) => {
    const angle = phase + (index + (random() - 0.5) * wobble) * Math.PI * 2 / sides;
    return [Math.cos(angle) * rx, Math.sin(angle) * rz];
  });
}
function loftStone(cx: number, cz: number, width: number, height: number, random: () => number, moss: number) {
  const sides = 6 + Math.floor(random() * 3);
  const squash = 0.65 + random() * 0.35;
  const yaw = random() * Math.PI * 2;
  const stations: Array<readonly [number, number]> = [[0.82, 0], [1, 0.28 + random() * 0.1], [0.86, 0.62 + random() * 0.1], [0.38 + random() * 0.2, 1]];
  const rings: FacetedStation[] = stations.map(([radius, y], index) => ({
    center: [
      cx + (index ? (random() - 0.5) * width * 0.12 : 0),
      y * height,
      cz + (index ? (random() - 0.5) * width * 0.12 : 0),
    ],
    outline: stoneOutline(radius * width / 2, radius * width / 2 * squash, sides, yaw + index * 0.35, 0.6, random),
  }));
  return buildLoftStone(rings, moss);
}
function buildTall(config: ReturnType<typeof save>): AssetBuild {
  const p = config.applied;
  const count = Number(p.count), size = Number(p.size), spread = Number(p.spread), flat = Number(p.flatness);
  const random = forgeRandom(Number(p.seed));
  let reach = 0;
  const entries: Array<{ name: string, role: 'stone' | 'moss', positions: number[] }> = [];
  const push = (name: string, solid: ReturnType<typeof buildLoftStone>) => {
    for (const part of solid.parts) entries.push({ name: part.role === 'stone' ? name : name + '-moss', role: part.role, positions: part.positions });
  };
  for (let i = 0; i < count; i++) {
    const scale = i === 0 ? 1 : 0.35 + random() * 0.5;
    const height = size * scale, width = height / flat;
    const angle = i * 2.39996 + random() * 0.5;
    const distance = i === 0 ? 0 : size * spread * 0.45 * Math.sqrt(i);
    reach = Math.max(reach, distance + width * 0.5);
    const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance
    const solid = buildFacetStone(moundCuts(Number(p.seed) + i * 97, false), { width, height, depth: width * (0.72 + random() * 0.2), moss: 0.62, yaw: random() * Math.PI * 2, lean: (random() - 0.5) * 0.08 })
    for (const part of solid.parts) { const positions = part.positions.slice(); for (let k = 0; k < positions.length; k += 3) { positions[k] = positions[k]! + x; positions[k + 2] = positions[k + 2]! + z } entries.push({ name: part.role === 'stone' ? 'rock-' + i : 'rock-' + i + '-moss', role: part.role, positions }) }
  }
  for (let i = 0; i < Number(p.pebbles); i++) {
    const angle = random() * Math.PI * 2;
    const distance = reach * (0.85 + random() * 0.3 * Math.min(1.5, spread));
    const height = size * (0.05 + random() * 0.07);
    const width = height / Math.max(0.35, flat * 0.7);
    const x = Math.cos(angle) * distance, z = Math.sin(angle) * distance
    const solid = buildFacetStone(nuggetCuts(Number(p.seed) + 400 + i * 13), { width, height, depth: width * (0.8 + random() * 0.25), moss: 0, yaw: random() * Math.PI * 2 })
    for (const part of solid.parts) { const positions = part.positions.slice(); for (let k = 0; k < positions.length; k += 3) { positions[k] = positions[k]! + x; positions[k + 2] = positions[k + 2]! + z } entries.push({ name: 'pebble-' + i, role: part.role, positions }) }
  }
  return assemble(config, entries);
}
function build(input: unknown): AssetBuild {
  const config = save(input), p = config.applied;
  if (Number(p.flatness) >= 0.9) return buildTall(config);
  const count = Number(p.count), size = Number(p.size), spread = Number(p.spread), flat = Number(p.flatness);
  const random = rng(Number(p.seed));
  const stones: Placed[] = [];
  for (let i = 0; i < count; i++) {
    const scale = i === 0 ? 1 : 0.4 + random() * 0.38;
    const height = size * scale;
    const width = height / Math.max(0.3, flat);
    const depth = width * (0.7 + random() * 0.36);
    const angle = i * 2.399963 + random() * 0.45;
    const distance = i === 0 ? 0 : size * spread * 0.38 * Math.sqrt(i);
    stones.push({
      name: 'rock-' + i, x: Math.cos(angle) * distance, z: Math.sin(angle) * distance,
      width, height, depth, seed: Number(p.seed) + i * 97, yaw: random() * Math.PI * 2,
      lean: (random() - 0.5) * (flat >= 0.9 ? 0.14 : 0.03),
      moss: flat >= 0.9 ? 0.7 : 0.55, flatness: flat, pebble: false,
    });
  }
  separate(stones, 0);
  let reach = 0;
  for (const stone of stones) reach = Math.max(reach, Math.hypot(stone.x, stone.z) + Math.min(stone.width, stone.depth) * 0.42);
  const pebbleStart = stones.length;
  for (let i = 0; i < Number(p.pebbles); i++) {
    const height = size * (0.075 + random() * 0.045);
    const width = height / 0.7;
    const depth = width * (0.78 + random() * 0.28);
    const ring = count === 1;
    const angle = ring ? (i + 0.35) * Math.PI * 2 / Math.max(1, Number(p.pebbles)) + (random() - 0.5) * 0.42 : random() * Math.PI * 2;
    const radius = Math.hypot(width, depth) * 0.5;
    const distance = ring ? reach * 0.78 + radius * 0.55 : reach + radius * 0.35 + random() * size * 0.035;
    stones.push({
      name: 'pebble-' + i, x: Math.cos(angle) * distance, z: Math.sin(angle) * distance,
      width, height, depth, seed: Number(p.seed) + 400 + i * 13, yaw: random() * Math.PI * 2,
      lean: (random() - 0.5) * 0.04, moss: 0, flatness: 0.7, pebble: true,
    });
  }
  separate(stones, pebbleStart);
  const entries: Array<{ name: string, role: 'stone' | 'moss', positions: number[] }> = [];
  for (const stone of stones) {
    const cuts = stone.pebble ? nuggetCuts(stone.seed) : stone.flatness <= 0.45 ? moundCuts(stone.seed, true) : moundCuts(stone.seed, false);
    const solid = buildFacetStone(cuts, { width: stone.width, height: stone.height, depth: stone.depth, moss: stone.moss, yaw: stone.yaw, lean: stone.lean });
    for (const part of solid.parts) {
      const positions = part.positions.slice();
      for (let i = 0; i < positions.length; i += 3) { positions[i] = positions[i]! + stone.x; positions[i + 2] = positions[i + 2]! + stone.z; }
      entries.push({ name: part.role === 'stone' ? stone.name : stone.name + '-moss', role: part.role, positions });
    }
  }
  return assemble(config, entries);
}
function assemble(config: ReturnType<typeof save>, entries: Array<{ name: string, role: 'stone' | 'moss', positions: number[] }>): AssetBuild {
  const p = config.applied, size = Number(p.size);
  const materials = {
    stone: new MeshStandardMaterial({ name: 'stone', color: String(p['color.stone']), roughness: 0.94, metalness: 0, flatShading: true }),
    moss: new MeshStandardMaterial({ name: 'moss', color: String(p['color.accent']), roughness: 0.94, metalness: 0, flatShading: true }),
  };
  const root = new Group();
  root.name = 'rock-cluster';
  for (const entry of entries) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(entry.positions, 3));
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, materials[entry.role]);
    mesh.name = entry.name;
    mesh.userData.materialRole = entry.role;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  root.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(root, true);
  if (bounds.min.y < -1e-3 || bounds.min.y > 1e-3) throw new Error('Rock cluster is not grounded (' + bounds.min.y + ')');
  const dimensions = bounds.getSize(new Vector3());
  if (Math.abs(dimensions.y - size) > Math.max(0.02, size * 0.04)) throw new Error('Rock cluster height ' + dimensions.y + ' does not match size ' + size);
  const anchors = { ground: [0, 0, 0], top: [0, dimensions.y, 0] };
  root.userData = { configuration: config, units: 'meters', up: '+Y', forward: '+Z', origin: 'ground-center', anchors };
  return { root, config, materials, anchors, bounds, dimensions };
}
const presets: Preset[] = [
  { id: 'outcrop', name: 'Outcrop', description: 'Five granite stones with grounded pebbles.', parameters: {} },
  { id: 'slabs', name: 'Slab field', description: 'Low sandstone slabs.', parameters: { count: 7, size: 0.6, flatness: 0.35, spread: 1.6, colorway: 'sandstone', seed: 77 } },
  { id: 'monolith', name: 'Monolith', description: 'One tall mossy stone with rubble at the base.', parameters: { count: 1, size: 2.8, flatness: 1.2, pebbles: 8, colorway: 'mossy', seed: 9 } },
];
export const rockClusterRecipe: Recipe = {
  descriptor: {
    id: 'rock-cluster', version: '1.2.0', title: 'Rock cluster', description: 'Faceted stones and pebbles with moss on the surface.',
    controls, defaults: parseControls(controls, {}), presets,
    palettes: Object.entries(palettes).map(([id, palette]) => ({ id, label: palette.label, colors: [palette.stone, palette.accent], parameters: { 'color.stone': palette.stone, 'color.accent': palette.accent } })),
    save, state: input => parameterState(controls, input),
  },
  build, load,
  validationCases: [
    ...presets,
    { id: 'monolith-mossy', name: 'Monolith mossy', parameters: { count: 1, size: 2.8, flatness: 1.2, pebbles: 8, colorway: 'mossy', seed: 9 } },
    { id: 'outcrop-granite-v1', name: 'Granite outcrop v1', parameters: { colorway: 'granite', count: 6, size: 1.1, spread: 1, flatness: 0.6, pebbles: 7, seed: 43384 } },
  ],
  integrationCases: [
    { id: 'outcrop', name: 'Outcrop', parameters: {} },
    { id: 'slabs', name: 'Slabs', parameters: presets[1]!.parameters },
  ],
  constraints: ['Each stone is a closed faceted solid on y = 0. Moss is a surface region, not a separate blob. Pebbles sit outside the main stones.'],
  presentation: { category: 'Nature', order: 160, kitIds: [] },
  source: { entry: 'examples/recipes/rock-cluster/index.ts', exportName: 'rockClusterRecipe' },
};
