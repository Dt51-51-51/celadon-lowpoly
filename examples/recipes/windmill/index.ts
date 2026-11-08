import { Box3, BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { AssetBuild } from '../../../src/catalog/types.ts';
import { facetedLoft } from '../../../src/engine/geometry.ts';
import type { Control, Design, Preset } from '../../../src/engine/parameters.ts';
import { parameterState, parseControls, plainRecord } from '../../../src/engine/parameters.ts';
import type { Recipe } from '../../../src/recipes/types.ts';

const colors = { wall: '#8a6a4a', roof: '#4e4a48', wood: '#5a4330', cloth: '#e6dcc4', stone: '#9a948a' };
const controls: Control[] = [
  { key: 'form', label: 'Mill type', kind: 'choice', group: 'construction', unit: 'none', default: 'post', options: [{ value: 'post', label: 'Post mill' }, { value: 'smock', label: 'Smock mill' }, { value: 'tower', label: 'Tower mill' }], hint: 'Timber post mill on a trestle, eight-sided smock, or round stone tower.', affects: ['topology'], targets: ['body'] },
  { key: 'height', label: 'Body height', kind: 'range', group: 'shape', unit: 'm', min: 5, max: 14, step: 0.1, default: 8, hint: 'Height to the top of the cap.', affects: ['geometry'], targets: ['body'] },
  { key: 'sailLength', label: 'Sail length', kind: 'range', group: 'shape', unit: 'ratio', min: 0.35, max: 0.6, step: 0.01, default: 0.48, hint: 'Sail length relative to height.', affects: ['geometry'], targets: ['sails'] },
  { key: 'sailTurn', label: 'Sail turn', kind: 'range', group: 'shape', unit: 'ratio', min: 0, max: 0.25, step: 0.005, default: 0.055, hint: 'Rotation of the sails.', affects: ['geometry'], targets: ['sails'] },
  { key: 'cloth', label: 'Sail cloth', kind: 'toggle', group: 'construction', unit: 'none', default: true, hint: 'Cloth spread on the lattice.', affects: ['geometry'], targets: ['sails'] },
  ...Object.entries(colors).map(([role, value]): Control => ({ key: 'color.' + role, label: role, kind: 'color', group: 'colors', unit: 'color', default: value, role, hint: role + ' color', affects: ['material'], targets: [role] })),
];
function save(input: unknown): Design { const requested = { ...plainRecord(input) }; return { formatVersion: 1, family: 'windmill', familyVersion: '2.0.0', requested, applied: parseControls(controls, requested) }; }
function load(input: unknown): Design { const v = plainRecord(input); if (v.formatVersion !== 1 || v.family !== 'windmill') throw new Error('Unsupported windmill design'); return save(plainRecord(v.requested)); }
type Role = keyof typeof colors;
const ring = (r: number, sides: number, phase = 0, sz = 1): Array<[number, number]> => Array.from({ length: sides }, (_, i) => { const t = phase + i * Math.PI * 2 / sides; return [Math.cos(t) * r, Math.sin(t) * r * sz]; });
function shaped(size: [number, number, number], move: (v: Vector3) => Vector3 = v => v): BufferGeometry {
  const src = new BoxGeometry(...size).toNonIndexed().getAttribute('position'), out: number[] = [], v = new Vector3()
  const pts: Vector3[] = []
  for (let i = 0; i < src.count; i++) pts.push(move(v.fromBufferAttribute(src, i).clone()))
  for (let i = 0; i < pts.length; i += 3) { const [a, b, c] = [pts[i]!, pts[i + 1]!, pts[i + 2]!]; if (b.clone().sub(a).cross(c.clone().sub(a)).lengthSq() > 1e-12) out.push(...a.toArray(), ...b.toArray(), ...c.toArray()) }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(out, 3)); return g
}
function beam(a: Vector3, b: Vector3, w: number, d = w): BufferGeometry {
  const len = a.distanceTo(b), g = shaped([w, len, d]), dir = b.clone().sub(a).normalize()
  const up = new Vector3(0, 1, 0), m = new Matrix4()
  const axis = up.clone().cross(dir), angle = Math.acos(Math.min(1, Math.max(-1, up.dot(dir))))
  if (axis.lengthSq() > 1e-10) m.makeRotationAxis(axis.normalize(), angle); else if (dir.y < 0) m.makeRotationX(Math.PI)
  g.applyMatrix4(m); g.translate(...a.clone().add(b).multiplyScalar(0.5).toArray()); return g
}
function build(input: unknown): AssetBuild {
  const config = save(input), p = config.applied, form = String(p.form), H = Number(p.height), u = H / 8
  const parts: Record<Role, BufferGeometry[]> = { wall: [], roof: [], wood: [], cloth: [], stone: [] }
  const add = (role: Role, g: BufferGeometry, x = 0, y = 0, z = 0) => { g.translate(x, y, z); parts[role].push(g) }
  let hub: Vector3
  if (form === 'post') {
    const sill = 0.45 * u, bodyY = 3.1 * u, bw = 2.8 * u, bd = 3.4 * u, bh = 3.2 * u
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) add('stone', shaped([0.7 * u, 0.5 * u, 0.7 * u]), x * 1.7 * u, 0.25 * u, z * 1.7 * u)
    add('wood', beam(new Vector3(-1.9 * u, sill, 0), new Vector3(1.9 * u, sill, 0), 0.3 * u))
    add('wood', beam(new Vector3(0, sill + 0.3 * u, -1.9 * u), new Vector3(0, sill + 0.3 * u, 1.9 * u), 0.3 * u))
    for (const [x, z] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) add('wood', beam(new Vector3(x * 1.6 * u, sill + 0.1 * u, z * 1.6 * u), new Vector3(x * 0.2 * u, 2.2 * u, z * 0.2 * u), 0.22 * u))
    add('wood', beam(new Vector3(0, sill, 0), new Vector3(0, bodyY + 0.2 * u, 0), 0.45 * u))
    add('wall', shaped([bw, bh, bd]), 0, bodyY + bh / 2, 0)
    for (let k = 1; k < 4; k++) add('wood', shaped([bw + 0.06 * u, 0.06 * u, bd + 0.06 * u]), 0, bodyY + bh * k / 4, 0)
    const ridge = 1.1 * u, top = bodyY + bh
    add('roof', shaped([bw + 0.5 * u, ridge, bd + 0.6 * u], v => { if (v.y > 0) v.x = 0; return v }), 0, top + ridge / 2, 0)
    add('roof', shaped([0.35 * u, 0.3 * u, 0.12 * u]), 0, top + 0.15 * u, bd / 2 + 0.06 * u)
    hub = new Vector3(0, top - 0.1 * u, bd / 2 + 0.55 * u)
    add('wood', beam(new Vector3(0, top - 0.1 * u, bd / 2 - 0.3 * u), hub.clone(), 0.3 * u))
    add('wood', shaped([0.7 * u, 1.3 * u, 0.06 * u]), 0, bodyY + 0.65 * u, -bd / 2 - 0.03 * u)
    const foot = new Vector3(0, 0.12 * u, -bd / 2 - 2.6 * u), door = new Vector3(0, bodyY, -bd / 2)
    for (const s of [-1, 1]) add('wood', beam(foot.clone().add(new Vector3(s * 0.4 * u, 0, 0)), door.clone().add(new Vector3(s * 0.4 * u, 0, 0)), 0.1 * u, 0.16 * u))
    for (let k = 1; k < 9; k++) { const t = k / 9, c = foot.clone().lerp(door, t); add('wood', beam(c.clone().add(new Vector3(-0.4 * u, 0, 0)), c.clone().add(new Vector3(0.4 * u, 0, 0)), 0.06 * u)) }
    add('wood', beam(new Vector3(0, bodyY + 0.2 * u, -bd / 2), new Vector3(0, 0.25 * u, -bd / 2 - 3.6 * u), 0.18 * u))
  } else {
    const smock = form === 'smock', sides = smock ? 8 : 12, base = smock ? 1.3 * u : 0, r0 = smock ? 2.1 * u : 2.4 * u, r1 = smock ? 1.35 * u : 1.6 * u, towerTop = 6.6 * u, ph = Math.PI / sides
    if (smock) {
      add('stone', facetedLoft([{ center: [0, 0, 0], outline: ring(2.4 * u, sides, ph) }, { center: [0, base, 0], outline: ring(2.35 * u, sides, ph) }]))
      add('wood', facetedLoft([{ center: [0, base, 0], outline: ring(2.9 * u, sides, ph) }, { center: [0, base + 0.12 * u, 0], outline: ring(2.9 * u, sides, ph) }]))
    }
    add(smock ? 'wall' : 'stone', facetedLoft([{ center: [0, base, 0], outline: ring(r0, sides, ph) }, { center: [0, towerTop, 0], outline: ring(r1, sides, ph) }]))
    add('wood', facetedLoft([{ center: [0, towerTop, 0], outline: ring(r1 + 0.12 * u, sides, ph) }, { center: [0, towerTop + 0.18 * u, 0], outline: ring(r1 + 0.12 * u, sides, ph) }]))
    const capTop = H, capH = capTop - towerTop - 0.18 * u
    add('roof', facetedLoft(smock ? [{ center: [0, towerTop + 0.18 * u, 0], outline: ring(r1 + 0.05 * u, sides, ph, 1.15) }, { center: [0, towerTop + 0.18 * u + capH * 0.55, 0], outline: ring(r1 * 0.75, sides, ph, 1.15) }, { center: [0, capTop, 0], outline: ring(r1 * 0.15, sides, ph, 1.15) }] : [{ center: [0, towerTop + 0.18 * u, 0], outline: ring(r1 + 0.15 * u, sides, ph) }, { center: [0, capTop, 0], outline: ring(0.12 * u, sides, ph) }]))
    add('wood', shaped([0.9 * u, 1.7 * u, 0.2 * u]), 0, (smock ? base : 0) + 0.85 * u, r0 * 0.97)
    for (const y of [3 * u, 5 * u]) { const r = r0 + (r1 - r0) * (y - base) / (towerTop - base); add('wood', shaped([0.5 * u, 0.7 * u, 0.15 * u]), 0, y, r * 0.98) }
    hub = new Vector3(0, towerTop + 0.7 * u, r1 + 0.75 * u)
    add('wood', beam(new Vector3(0, towerTop + 0.7 * u, 0), hub.clone(), 0.32 * u))
    if (smock) add('wood', beam(new Vector3(0, towerTop + 0.5 * u, -r1), new Vector3(0, base + 0.2 * u, -r0 - 2.4 * u), 0.16 * u))
  }
  const sailLen = Number(p.sailLength) * H, angle = Number(p.sailTurn) * Math.PI * 2, w = sailLen * 0.24
  add('wood', facetedLoft([{ center: [0, -0.25 * u, 0], outline: ring(0.32 * u, 8) }, { center: [0, 0.25 * u, 0], outline: ring(0.32 * u, 8) }]).rotateX(Math.PI / 2), hub.x, hub.y, hub.z + 0.1 * u)
  for (let k = 0; k < 4; k++) {
    const m = new Matrix4().makeRotationZ(angle + k * Math.PI / 2).premultiply(new Matrix4().makeTranslation(hub.x, hub.y, hub.z + 0.2 * u))
    const local: Array<[Role, BufferGeometry]> = []
    local.push(['wood', beam(new Vector3(0, 0.2 * u, 0), new Vector3(0, sailLen, 0), 0.16 * u, 0.12 * u)])
    local.push(['wood', beam(new Vector3(w, sailLen * 0.22, 0), new Vector3(w, sailLen, 0), 0.07 * u)])
    for (let b = 0; b <= 7; b++) { const y = sailLen * (0.22 + 0.78 * b / 7); local.push(['wood', beam(new Vector3(-0.08 * u, y, 0), new Vector3(w + 0.04 * u, y, 0), 0.05 * u)]) }
    for (let b = 0; b < 3; b++) local.push(['wood', beam(new Vector3(w * (b + 1) / 4, sailLen * 0.22, 0), new Vector3(w * (b + 1) / 4, sailLen, 0), 0.035 * u)])
    if (p.cloth === true) local.push(['cloth', shaped([w - 0.04 * u, sailLen * 0.76, 0.03 * u]).translate(w / 2, sailLen * 0.61, -0.07 * u)])
    for (const [role, g] of local) { g.applyMatrix4(m); parts[role].push(g) }
  }
  const materials = Object.fromEntries((Object.keys(colors) as Role[]).map(role => [role, new MeshStandardMaterial({ name: role, color: String(p['color.' + role]), roughness: 0.88, metalness: 0, flatShading: true, side: role === 'cloth' ? 2 : 0 })]))
  const root = new Group(); root.name = 'windmill'
  for (const role of Object.keys(colors) as Role[]) {
    if (!parts[role].length) continue
    const positions: number[] = []
    for (const g of parts[role]) { const a = (g.index ? g.toNonIndexed() : g).getAttribute('position'); positions.push(...(a.array as Float32Array)) }
    const geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(positions, 3)); geometry.computeVertexNormals()
    const mesh = new Mesh(geometry, materials[role]); mesh.name = role; mesh.userData.materialRole = role; mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh)
  }
  root.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(root, true)
  if (bounds.min.y < -1e-3) throw new Error('Windmill sails reach below ground (' + bounds.min.y.toFixed(2) + ')')
  const dimensions = bounds.getSize(new Vector3()), anchors = { ground: [0, 0, 0], top: [0, dimensions.y, 0] }
  root.userData = { configuration: config, units: 'meters', up: '+Y', forward: '+Z', origin: 'ground-center', anchors }
  return { root, config, materials, anchors, bounds, dimensions }
}
const presets: Preset[] = [
  { id: 'post', name: 'Post mill', description: 'Timber buck on a trestle with a ladder and tail pole.', parameters: {} },
  { id: 'smock', name: 'Smock mill', description: 'Eight-sided timber smock on a brick base with a stage.', parameters: { form: 'smock', height: 9, 'color.wall': '#e8e2d2', 'color.roof': '#3e5a4a', sailTurn: 0.1 } },
  { id: 'tower', name: 'Tower mill', description: 'Round stone tower with a conical cap.', parameters: { form: 'tower', height: 10, 'color.roof': '#3f3a38', sailTurn: 0.03 } },
];
export const windmillRecipe: Recipe = {
  descriptor: { id: 'windmill', version: '2.0.0', title: 'Windmill', description: 'A working windmill with lattice sails: a post mill on a trestle, an eight-sided smock mill or a round stone tower mill.', controls, defaults: parseControls(controls, {}), presets, palettes: [], save, state: input => parameterState(controls, input) },
  build, load, validationCases: [...presets], integrationCases: [{ id: 'post', name: 'Post mill', parameters: {} }],
  constraints: ['Sails clear the ground; every part is a closed box, beam or faceted loft.'],
  presentation: { category: 'Buildings', order: 170, kitIds: [] },
  source: { entry: 'examples/recipes/windmill/index.ts', exportName: 'windmillRecipe' },
};
