import { loadConstructionDesign } from '../../../src/engine/construction-migration.ts';
import { Bone, Box3, BufferAttribute, BufferGeometry, Color, Group, MeshStandardMaterial, Skeleton, SkinnedMesh, Vector3 } from 'three';
import { parseControls, parameterState, plainRecord } from '../../../src/engine/parameters.ts';
import type { Control, Design, Parameters } from '../../../src/engine/parameters.ts';
import type { Recipe } from '../../../src/recipes/types.ts';
import type { RawRiggedBuild, RigMetadata } from '../../../src/rigging/types.ts';

const numbers = [['height', 'Height', 1.2, 2.2, 1.7], ['headRatio', 'Head proportion', .14, .26, .21], ['shoulderRatio', 'Shoulder width', .22, .34, .27], ['hipRatio', 'Hip width', .16, .26, .21], ['legRatio', 'Leg length', .38, .53, .43], ['armRatio', 'Arm length', .3, .4, .34], ['limbRatio', 'Limb radius', .035, .065, .046]] as const;
const colors = {skin: '#c99a78', tunic: '#5f7d5a', trousers: '#6b5642', boots: '#3f332c', belt: '#4a3626', hair: '#4a3427'};
const choices = [
  ['build', 'Build', 'standard', [['standard', 'Standard'], ['broad', 'Broad'], ['slim', 'Slim']], 'Torso and limb girth.'],
  ['sleeves', 'Sleeves', 'long', [['long', 'Long'], ['short', 'Short'], ['none', 'None']], 'How far the shirt covers the arms.'],
  ['hairStyle', 'Hair', 'short', [['short', 'Short'], ['bald', 'Bald'], ['topknot', 'Top knot']], 'Hair on the head.'],
] as const;
const controls: Control[] = [
  ...numbers.map(([key, label, min, max, value]): Control => ({key, label, kind: 'range', group: 'shape', unit: key === 'height' ? 'm' : 'ratio', min, max, step: .005, default: value, hint: label, affects: ['geometry'], targets: ['body', 'skeleton']})),
  ...choices.map(([key, label, value, options, hint]): Control => ({key, label, kind: 'choice', group: 'construction', unit: 'none', default: value, options: options.map(([v, l]) => ({value: v, label: l})), hint, affects: ['geometry'], targets: ['body']})),
  {key: 'beard', label: 'Beard', kind: 'toggle', group: 'construction', unit: 'none', default: false, hint: 'Beard over the jaw.', affects: ['geometry'], targets: ['body']},
  ...Object.entries(colors).map(([role, value]): Control => ({key: 'color.' + role, label: role, kind: 'color', group: 'colors', unit: 'color', default: value, role, hint: role + ' color', affects: ['material'], targets: [role]})),
];
function save(input: unknown): Design { const requested = {...plainRecord(input)}; return {formatVersion: 1, family: 'stylized-humanoid', familyVersion: '1.0.0', requested, applied: parseControls(controls, requested)}; }
function load(input: unknown): Design { return loadConstructionDesign(input, 'stylized-humanoid', '1.0.0', [], save, () => { throw new Error('No prior humanoid version'); }); }

type RGB = [number, number, number];
type Weights = [number, number][];
interface Ring { c: Vector3, rx: number, rz: number, color: RGB, w: Weights }
interface Frame { right: Vector3, fwd: Vector3 }
const pack = (value: unknown): RGB => { const c = new Color(String(value)); return [c.r, c.g, c.b]; };
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const UPRIGHT: Frame = {right: new Vector3(1, 0, 0), fwd: new Vector3(0, 0, 1)};
const ALONG_Z: Frame = {right: new Vector3(1, 0, 0), fwd: new Vector3(0, 1, 0)};
function frameAlong(axis: Vector3): Frame {
  const a = axis.clone().normalize(), fwd = new Vector3(0, 0, 1).addScaledVector(a, -a.z).normalize()
  return {right: a.clone().cross(fwd).normalize(), fwd}
}

class RingMesh {
  readonly position: number[] = []; readonly color: number[] = []; readonly joints: number[] = []; readonly weights: number[] = []
  private vertex(p: Vector3, c: RGB, w: Weights) {
    this.position.push(p.x, p.y, p.z); this.color.push(...c)
    const top = [...w].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 4), sum = top.reduce((s, [, v]) => s + v, 0)
    for (let k = 0; k < 4; k++) { this.joints.push(top[k]?.[0] ?? 0); this.weights.push(top[k] ? top[k]![1] / sum : 0) }
  }
  private tri(a: [Vector3, Weights], b: [Vector3, Weights], c: [Vector3, Weights], color: RGB) { for (const [p, w] of [a, b, c]) this.vertex(p, color, w) }
  loft(rings: Ring[], frame: Frame, sides = 8, phase = Math.PI / sides) {
    const point = (r: Ring, j: number): [Vector3, Weights] => { const t = phase + j * Math.PI * 2 / sides; return [r.c.clone().addScaledVector(frame.right, Math.cos(t) * r.rx).addScaledVector(frame.fwd, Math.sin(t) * r.rz), r.w] }
    const along = rings.at(-1)!.c.clone().sub(rings[0]!.c)
    const flip = frame.right.clone().cross(frame.fwd).dot(along) > 0
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < sides; j++) {
      const a = point(rings[i]!, j), b = point(rings[i]!, j + 1), c = point(rings[i + 1]!, j + 1), d = point(rings[i + 1]!, j), color = rings[i]!.color
      if (flip) { this.tri(a, b, c, color); this.tri(a, c, d, color) } else { this.tri(a, c, b, color); this.tri(a, d, c, color) }
    }
    for (const [ring, start] of [[rings[0]!, true], [rings.at(-1)!, false]] as const) for (let j = 0; j < sides; j++) {
      const o: [Vector3, Weights] = [ring.c.clone(), ring.w], p = point(ring, j), q = point(ring, j + 1)
      if (start !== flip) this.tri(o, p, q, ring.color); else this.tri(o, q, p, ring.color)
    }
  }
  box(center: Vector3, size: [number, number, number], color: RGB, w: Weights, taper = 1) {
    const [sx, sy, sz] = size, k = Math.SQRT2 / 2
    this.loft([{c: center.clone().add(new Vector3(0, 0, -sz / 2)), rx: sx * k, rz: sy * k, color, w}, {c: center.clone().add(new Vector3(0, 0, sz / 2)), rx: sx * k * taper, rz: sy * k * taper, color, w}], ALONG_Z, 4, Math.PI / 4)
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new BufferAttribute(new Float32Array(this.position), 3))
    g.setAttribute('color', new BufferAttribute(new Float32Array(this.color), 3))
    g.setAttribute('skinIndex', new BufferAttribute(new Uint16Array(this.joints), 4))
    g.setAttribute('skinWeight', new BufferAttribute(new Float32Array(this.weights), 4))
    g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere()
    return g
  }
}

function build(input: unknown): RawRiggedBuild {
  const config = save(input), p = config.applied as Parameters
  const h = Number(p.height), H = h * Number(p.headRatio), hipY = h * Number(p.legRatio), shoulderY = h - H - h * .035, T = shoulderY - hipY
  const g = p.build === 'broad' ? 1.15 : p.build === 'slim' ? .88 : 1
  const shoulderX = h * Number(p.shoulderRatio) / 2 * (p.build === 'broad' ? 1.08 : 1), hipW = h * Number(p.hipRatio) * .55 * g, hipX = h * Number(p.hipRatio) * .3 * g, r = h * Number(p.limbRatio) * g, ankleY = .055 * h
  const skin = pack(p['color.skin']), tunic = pack(p['color.tunic']), trousers = pack(p['color.trousers']), boots = pack(p['color.boots']), belt = pack(p['color.belt']), hair = pack(p['color.hair'])
  const dark: RGB = [.06, .05, .05], trim = mix(tunic, dark, .35), lip = mix(skin, [.55, .22, .2], .45), buckle = mix(belt, [.85, .7, .35], .7), sole = mix(boots, dark, .5)
  const names = ['motion_root', 'hips', 'spine', 'chest', 'neck', 'head']
  for (const x of ['l', 'r']) names.push('upper_arm_' + x, 'forearm_' + x, 'hand_' + x, 'thigh_' + x, 'shin_' + x, 'foot_' + x, 'toe_' + x)
  const parent: Record<string, string> = {hips: 'motion_root', spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck'}
  for (const x of ['l', 'r']) Object.assign(parent, {['upper_arm_' + x]: 'chest', ['forearm_' + x]: 'upper_arm_' + x, ['hand_' + x]: 'forearm_' + x, ['thigh_' + x]: 'hips', ['shin_' + x]: 'thigh_' + x, ['foot_' + x]: 'shin_' + x, ['toe_' + x]: 'foot_' + x})
  const B = (name: string) => { const i = names.indexOf(name); if (i < 0) throw new Error('Missing bone ' + name); return i }
  const one = (name: string): Weights => [[B(name), 1]]
  const blend = (a: string, b: string, t: number): Weights => [[B(a), 1 - t], [B(b), t]]
  const points = new Map<string, Vector3>([['motion_root', new Vector3()]])
  const put = (name: string, point: Vector3) => { points.set(name, point); return point }
  put('hips', new Vector3(0, hipY, 0)); put('spine', new Vector3(0, hipY + T * .45, 0)); put('chest', new Vector3(0, shoulderY, 0))
  put('neck', new Vector3(0, h - H, 0)); const headPoint = put('head', new Vector3(0, h - H * .75, 0))
  const m = new RingMesh()
  const ring = (y: number, rx: number, rz: number, color: RGB, w: Weights, z = 0): Ring => ({c: new Vector3(0, y, z), rx, rz, color, w})
  const hemY = hipY - .03 * h, beltY = hipY + T * .22, depth = .1 * h * g
  m.loft([
    ring(hipY - .075 * h, hipW * .82, depth * .85, trousers, one('hips')),
    ring(hemY, hipW * 1.05, depth * 1.0, tunic, one('hips')),
    ring(hemY, hipW * 1.18, depth * 1.14, tunic, one('hips')),
    ring(beltY - .016 * h, hipW * 1.01, depth * 1.01, belt, blend('hips', 'spine', .5)),
    ring(beltY + .016 * h, hipW * 1.01, depth * 1.01, tunic, one('spine')),
    ring(hipY + T * .72, shoulderX * .86, depth * 1.12, tunic, blend('spine', 'chest', .6), .006 * h),
    ring(shoulderY - .01 * h, shoulderX * .78, depth * .95, tunic, one('chest')),
    ring(shoulderY + .018 * h, .07 * h, .06 * h, trim, one('chest')),
  ], UPRIGHT)
  m.box(new Vector3(0, beltY, depth * .96), [.05 * h, .036 * h, .02 * h], buckle, one('spine'))
  m.loft([ring(shoulderY - .01 * h, .043 * h, .04 * h, skin, one('neck')), ring(h - H * .82, .041 * h, .038 * h, skin, one('head'))], UPRIGHT)
  const head = one('head'), hz = .02 * H
  m.loft([
    ring(h - H * 1.0, H * .26, H * .25, skin, head, hz + .05 * H),
    ring(h - H * .84, H * .42, H * .41, skin, head, hz + .02 * H),
    ring(h - H * .52, H * .48, H * .46, skin, head, hz),
    ring(h - H * .2, H * .47, H * .45, skin, head, hz - .01 * H),
    ring(h - H * .03, H * .33, H * .32, skin, head, hz - .02 * H),
  ], UPRIGHT)
  const face = H * .46 * Math.cos(Math.PI / 8) + hz
  if (p.hairStyle !== 'bald') {
    m.loft([
      ring(h - H * .62, H * .5, H * .44, hair, head, hz - .07 * H),
      ring(h - H * .34, H * .52, H * .5, hair, head, hz - .055 * H),
      ring(h - H * .12, H * .51, H * .5, hair, head, hz - .03 * H),
      ring(h, H * .36, H * .35, hair, head, hz - .03 * H),
    ], UPRIGHT)
    m.box(new Vector3(0, h - H * .27, face - .01 * H), [H * .78, H * .16, H * .1], hair, head)
    if (p.hairStyle === 'topknot') m.loft([ring(h - H * .02, H * .12, H * .12, hair, head, -.08 * H), ring(h + H * .2, H * .14, H * .14, hair, head, -.1 * H), ring(h + H * .3, H * .06, H * .06, hair, head, -.1 * H)], UPRIGHT)
  }
  for (const side of [1, -1]) {
    m.box(new Vector3(side * H * .17, h - H * .48, face), [H * .075, H * .11, H * .05], dark, head)
    m.box(new Vector3(side * H * .17, h - H * .35, face + .005 * H), [H * .15, H * .035, H * .05], p.hairStyle === 'bald' ? mix(skin, dark, .45) : hair, head)
    m.loft([{c: new Vector3(side * H * .44, h - H * .52, -.02 * H), rx: H * .03, rz: H * .1, color: skin, w: head}, {c: new Vector3(side * H * .52, h - H * .52, -.03 * H), rx: H * .025, rz: H * .08, color: skin, w: head}], {right: new Vector3(0, 0, 1), fwd: new Vector3(0, 1, 0)}, 4, Math.PI / 4)
  }
  m.box(new Vector3(0, h - H * .62, face + .03 * H), [H * .09, H * .15, H * .1], mix(skin, [.8, .45, .4], .15), head, .55)
  if (p.beard === true) m.loft([
    ring(h - H * 1.08, H * .2, H * .2, hair, head, hz + .09 * H),
    ring(h - H * .9, H * .43, H * .43, hair, head, hz + .04 * H),
    ring(h - H * .68, H * .49, H * .465, hair, head, hz + .005 * H),
  ], UPRIGHT)
  else m.box(new Vector3(0, h - H * .8, face - .03 * H), [H * .14, H * .03, H * .06], lip, head)
  const len = Number(p.armRatio) * h, ar = r * .82
  const cuff = p.sleeves === 'long' ? .9 : p.sleeves === 'short' ? .38 : .05
  for (const [x, side] of [['l', 1], ['r', -1]] as const) {
    const upper = put('upper_arm_' + x, new Vector3(side * (shoulderX - .012 * h), shoulderY - .045 * h, 0))
    const elbow = put('forearm_' + x, upper.clone().add(new Vector3(side * .4, -Math.sqrt(1 - .16), 0).multiplyScalar(len * .52)))
    const wrist = put('hand_' + x, elbow.clone().add(new Vector3(side * .22, -Math.sqrt(1 - .0484), .06).normalize().multiplyScalar(len * .48)))
    const at = (f: number) => f <= .52 ? upper.clone().lerp(elbow, f / .52) : elbow.clone().lerp(wrist, (f - .52) / .48)
    const rad = (f: number) => ar * (1.12 - .28 * f) * (f < -.1 ? .55 : f < -.05 ? .88 : 1)
    const wt = (f: number): Weights => f < .44 ? one('upper_arm_' + x) : f < .6 ? blend('upper_arm_' + x, 'forearm_' + x, (f - .44) / .16) : f < .97 ? one('forearm_' + x) : blend('forearm_' + x, 'hand_' + x, .5)
    const stops = [-.15, -.1, -.04, .1, .44, .52, .6, .8, 1].filter(f => Math.abs(f - cuff) > .03 && Math.abs(f - cuff - .05) > .03)
    const rings: Ring[] = []
    for (const f of [...stops, cuff].sort((a, b) => a - b)) {
      if (f === cuff) { rings.push({c: at(f), rx: rad(f), rz: rad(f), color: trim, w: wt(f)}, {c: at(f), rx: rad(f) * 1.14, rz: rad(f) * 1.14, color: trim, w: wt(f)}, {c: at(Math.min(1, f + .05)), rx: rad(f) * 1.12, rz: rad(f) * 1.12, color: trim, w: wt(f)}, {c: at(Math.min(1, f + .05)), rx: rad(f + .05), rz: rad(f + .05), color: skin, w: wt(f)}); continue }
      rings.push({c: at(f), rx: rad(f), rz: rad(f), color: f < cuff ? tunic : skin, w: wt(f)})
    }
    m.loft(rings, frameAlong(wrist.clone().sub(upper)))
    const dir = wrist.clone().sub(elbow).normalize(), hf = frameAlong(dir), hw = one('hand_' + x)
    m.loft([{c: wrist.clone().addScaledVector(dir, -.01 * h), rx: ar * .75, rz: ar * .6, color: skin, w: hw}, {c: wrist.clone().addScaledVector(dir, .045 * h), rx: ar * 1.15, rz: ar * .72, color: skin, w: hw}, {c: wrist.clone().addScaledVector(dir, .095 * h), rx: ar * .85, rz: ar * .55, color: skin, w: hw}], hf, 4, Math.PI / 4)
    const thumb = wrist.clone().addScaledVector(dir, .03 * h).addScaledVector(hf.fwd, ar * .55)
    m.loft([{c: thumb, rx: ar * .3, rz: ar * .3, color: skin, w: hw}, {c: thumb.clone().addScaledVector(dir, .035 * h).addScaledVector(hf.fwd, ar * .35), rx: ar * .24, rz: ar * .24, color: skin, w: hw}], frameAlong(dir), 4, Math.PI / 4)
    const hip = put('thigh_' + x, new Vector3(side * hipX, hipY, 0))
    const knee = put('shin_' + x, new Vector3(side * hipX, ankleY + (hipY - ankleY) * .51, h * .04))
    const ankle = put('foot_' + x, new Vector3(side * hipX, ankleY, 0))
    put('toe_' + x, new Vector3(side * hipX, h * .025, h * .09))
    const legAt = (y: number) => y >= knee.y ? knee.clone().lerp(hip, (y - knee.y) / (hip.y - knee.y)) : ankle.clone().lerp(knee, (y - ankle.y) / (knee.y - ankle.y))
    const bootTop = ankleY + .13 * h
    const leg = (y: number, rad: number, color: RGB, w: Weights): Ring => { const c = legAt(Math.min(y, hip.y)); c.y = y; return {c, rx: rad, rz: rad, color, w} }
    m.loft([
      leg(hemY + .02 * h, r * .9, trousers, one('thigh_' + x)),
      leg(hemY - .02 * h, r * 1.02, trousers, one('thigh_' + x)),
      leg(hipY - .12 * h, r * 1.04, trousers, one('thigh_' + x)),
      leg(knee.y, r * .92, trousers, blend('thigh_' + x, 'shin_' + x, .5)),
      leg(knee.y - .1 * h, r * .96, trousers, one('shin_' + x)),
      leg(bootTop, r * .86, boots, one('shin_' + x)),
      leg(bootTop, r * 1.06, boots, one('shin_' + x)),
      leg(bootTop - .03 * h, r * 1.02, boots, blend('shin_' + x, 'foot_' + x, .5)),
      leg(ankleY + .01 * h, r * .98, boots, one('foot_' + x)),
    ], UPRIGHT)
    const k = Math.SQRT2 / 2, fw = r * 1.05, fh = .06 * h
    m.loft([
      {c: new Vector3(ankle.x, fh * .5, -.045 * h), rx: fw * k * 2, rz: fh * k * 2 * .5, color: boots, w: one('foot_' + x)},
      {c: new Vector3(ankle.x, fh * .5, .05 * h), rx: fw * k * 2.1, rz: fh * k * 2 * .5, color: boots, w: blend('foot_' + x, 'toe_' + x, .5)},
      {c: new Vector3(ankle.x, fh * .36, .135 * h), rx: fw * k * 1.8, rz: fh * k * 2 * .36, color: boots, w: one('toe_' + x)},
    ], ALONG_Z, 4, Math.PI / 4)
    void sole
  }
  const geometry = m.geometry()
  geometry.computeBoundingBox()
  const low = geometry.boundingBox!.min.y
  if (Math.abs(low) > 1e-6) { geometry.translate(0, -low, 0); for (const pt of points.values()) if (pt.lengthSq() > 0) pt.y -= low }
  const root = new Group(); root.name = 'stylized-humanoid'
  const bones: Bone[] = [], byName = new Map<string, Bone>()
  for (const name of names) {
    const node = new Bone(), point = points.get(name)!; node.name = name; node.position.copy(point)
    const from = parent[name]
    if (from) { node.position.sub(points.get(from)!); byName.get(from)!.add(node) } else root.add(node)
    bones.push(node); byName.set(name, node)
  }
  const material = new MeshStandardMaterial({name: 'body', color: '#ffffff', roughness: .9, metalness: 0, flatShading: true, vertexColors: true})
  const mesh = new SkinnedMesh(geometry, material)
  mesh.name = 'humanoid-body'; mesh.userData.materialRole = 'body'; mesh.castShadow = true; mesh.receiveShadow = true
  root.add(mesh); root.updateMatrixWorld(true)
  const skeleton = new Skeleton(bones); mesh.bind(skeleton); skeleton.update()
  const bounds = new Box3().setFromObject(root), anchors = {ground: [0, 0, 0] as [number, number, number], head: headPoint.toArray() as [number, number, number]}
  const rig: RigMetadata = {version: 1, kind: 'humanoid', bones: bones.map(node => ({name: node.name, parent: node.parent instanceof Bone ? node.parent.name : null})), meshes: ['humanoid-body'], chains: [{upper: 'thigh_l', lower: 'shin_l', end: 'foot_l', side: 'left'}, {upper: 'thigh_r', lower: 'shin_r', end: 'foot_r', side: 'right'}], clips: []}
  root.userData = {configuration: config, units: 'meters', up: '+Y', forward: '+Z', origin: 'ground-center', anchors}
  return {root, config, materials: {body: material}, bounds, dimensions: bounds.getSize(new Vector3()), anchors, rig}
}
const defaults = parseControls(controls, {});
export const humanoidRecipe: Recipe = {
  descriptor: {
    id: 'stylized-humanoid', version: '1.0.0', title: 'Stylized adventurer', description: 'Low-poly clothed humanoid built from faceted rings, with clothing edges on ring lines and weighted joints.', controls, defaults,
    presets: [
      {id: 'default', name: 'Adventurer', description: 'Green tunic, brown trousers and boots, short hair.', parameters: {}},
      {id: 'brawler', name: 'Brawler', description: 'Broad, sleeveless fighter with a beard.', parameters: {build: 'broad', sleeves: 'none', beard: true, shoulderRatio: .31, height: 1.82, 'color.tunic': '#8a3e2e', 'color.trousers': '#3d3a36', 'color.skin': '#b5835f', 'color.hair': '#2a211c'}},
      {id: 'monk', name: 'Monk', description: 'Slim monk in a saffron robe with a shaved head.', parameters: {build: 'slim', hairStyle: 'bald', sleeves: 'short', 'color.tunic': '#d08a2e', 'color.trousers': '#7a4a2a', 'color.belt': '#6b2f1c', 'color.boots': '#5a4430', 'color.skin': '#d0a07c'}},
    ],
    palettes: [], save, state: input => parameterState(controls, input),
  },
  build, load, validationCases: [{id: 'default', name: 'Default proportions', parameters: {}}], integrationCases: [],
  constraints: ['Flat ground contact only', 'One skinned mesh; clothing edges sit on ring lines'],
  presentation: {category: 'character', order: 100, kitIds: []},
  source: {entry: 'examples/recipes/stylized-humanoid/index.ts', exportName: 'humanoidRecipe'},
};
