import { Bone, Box3, Color, Group, MeshStandardMaterial, Skeleton, SkinnedMesh, Vector3 } from 'three';
import { SculptBody } from '../../../src/engine/sculpt/body.ts';
import type { Control, Design } from '../../../src/engine/parameters.ts';
import { parseControls, parameterState, plainRecord } from '../../../src/engine/parameters.ts';
import { loadConstructionDesign } from '../../../src/engine/construction-migration.ts';
import type { Recipe } from '../../../src/recipes/types.ts';
import type { RawRiggedBuild, RigMetadata, RiggedAssetBuild } from '../../../src/rigging/types.ts';
import type { SemanticAssetBuild } from '../../../src/catalog/types.ts';
import { createFoxMotion } from '../../../src/rigging/fox-motion.ts';
import { validateRig, validateRigMotion } from '../../../src/rigging/validation.ts';

const ranges = [
  ['bodyLength', 'Body length', 0.26, 0.5, 0.4, 'm'],
  ['earRatio', 'Ear length', 0.45, 1.05, 0.62, 'ratio'],
  ['haunch', 'Haunch size', 0.85, 1.25, 1, 'ratio'],
  ['legRatio', 'Leg length', 0.8, 1.3, 1, 'ratio'],
  ['headRatio', 'Head size', 0.85, 1.2, 1, 'ratio'],
] as const;
const colors = {fur: '#998d7d', cream: '#e6e2da', dark: '#1d1714'};
const controls: Control[] = [
  ...ranges.map(([key, label, min, max, value, unit]): Control => ({key, label, kind: 'range', group: 'shape', unit, min, max, step: 0.005, default: value, hint: label, affects: ['geometry'], targets: ['body', 'skeleton']})),
  {key: 'earStyle', label: 'Ears', kind: 'choice', group: 'construction', unit: 'none', default: 'upright', options: [{value: 'upright', label: 'Upright'}, {value: 'lop', label: 'Lop'}, {value: 'swept', label: 'Swept'}], hint: 'Upright rabbit ears, lop ears hanging beside the head, or long hare ears swept back.', affects: ['geometry'], targets: ['body', 'skeleton']},
  {key: 'build', label: 'Build', kind: 'choice', group: 'construction', unit: 'none', default: 'standard', options: [{value: 'standard', label: 'Standard'}, {value: 'stocky', label: 'Stocky'}, {value: 'lean', label: 'Lean'}], hint: 'Body girth.', affects: ['geometry'], targets: ['body', 'skeleton']},
  {key: 'earTips', label: 'Dark ear tips', kind: 'toggle', group: 'construction', unit: 'none', default: false, hint: 'Hare-style black ear tips.', affects: ['geometry'], targets: ['body']},
  ...Object.entries(colors).map(([role, value]): Control => ({key: 'color.' + role, label: role, kind: 'color', group: 'colors', unit: 'color', default: value, role, hint: role + ' material', affects: ['material'], targets: [role]})),
];
function save(input: unknown): Design {
  const requested = {...plainRecord(input)};
  return {formatVersion: 1, family: 'rigged-rabbit', familyVersion: '1.0.0', requested, applied: parseControls(controls, requested)};
}
function load(input: unknown): Design {
  return loadConstructionDesign(input, 'rigged-rabbit', '1.0.0', [], save, () => { throw new Error('No earlier rabbit version'); });
}
type RGB = [number, number, number];
const pack = (color: Color): RGB => [color.r, color.g, color.b];
function blendRGB(a: RGB, b: RGB, t: number): RGB { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
function build(input: unknown): RawRiggedBuild {
  const config = save(input), p = config.applied
  const L = Number(p.bodyLength), s = L / 0.4, earRatio = Number(p.earRatio), haunch = Number(p.haunch), legRatio = Number(p.legRatio), headRatio = Number(p.headRatio)
  const earStyle = String(p.earStyle), earTips = p.earTips === true, buildName = String(p.build)
  const girth = buildName === 'stocky' ? 1.12 : buildName === 'lean' ? 0.86 : 1
  const fur = pack(new Color(String(p['color.fur']))), cream = pack(new Color(String(p['color.cream']))), dark = pack(new Color(String(p['color.dark'])))
  const belly = blendRGB(fur, cream, 0.62), ring = blendRGB(fur, cream, 0.55), innerEar = blendRGB(blendRGB(fur, [0.78, 0.55, 0.52], 0.55), cream, 0.12)
  const nose = blendRGB(fur, dark, 0.55), iris = blendRGB(dark, [0.36, 0.22, 0.14], 0.55), pupil = blendRGB(dark, [0, 0, 0], 0.5), tip = blendRGB(fur, dark, 0.9)
  const lift = (legRatio - 1) * 0.07 * s
  const v = (x: number, y: number, z: number) => new Vector3(x * s, y * s + (y > 0.02 ? lift * Math.min(1, y / 0.09) : 0), z * s)
  const names = ['motion_root', 'pelvis', 'spine', 'chest', 'neck', 'head', 'ear_l', 'ear_r']
  for (const suffix of ['l', 'r']) names.push('scapula_' + suffix, 'front_upper_' + suffix, 'front_lower_' + suffix, 'front_paw_' + suffix)
  names.push('tail_base', 'tail_mid_a', 'tail_mid_b', 'tail_tip')
  for (const suffix of ['l', 'r']) names.push('hind_thigh_' + suffix, 'hind_shin_' + suffix, 'hind_hock_' + suffix, 'hind_paw_' + suffix)
  const bone = (name: string) => { const index = names.indexOf(name); if (index < 0) throw new Error('Missing bone ' + name); return index }
  const parent: Record<string, string> = {pelvis: 'motion_root', spine: 'pelvis', chest: 'spine', neck: 'chest', head: 'neck', tail_base: 'pelvis', tail_mid_a: 'tail_base', tail_mid_b: 'tail_mid_a', tail_tip: 'tail_mid_b'}
  for (const suffix of ['l', 'r']) {
    parent['ear_' + suffix] = 'head'; parent['scapula_' + suffix] = 'chest'; parent['front_upper_' + suffix] = 'scapula_' + suffix
    parent['front_lower_' + suffix] = 'front_upper_' + suffix; parent['front_paw_' + suffix] = 'front_lower_' + suffix
    parent['hind_thigh_' + suffix] = 'pelvis'; parent['hind_shin_' + suffix] = 'hind_thigh_' + suffix; parent['hind_hock_' + suffix] = 'hind_shin_' + suffix; parent['hind_paw_' + suffix] = 'hind_hock_' + suffix
  }
  const points = new Map<string, Vector3>([['motion_root', new Vector3()]])
  const put = (name: string, point: Vector3) => { points.set(name, point); return point }
  const pelvis = put('pelvis', v(0, 0.13, -0.08)), spine = put('spine', v(0, 0.15, -0.01)), chest = put('chest', v(0, 0.14, 0.06))
  put('neck', v(0, 0.19, 0.085)); const head = put('head', v(0, 0.212 , 0.138))
  put('tail_base', v(0, 0.095, -0.15)); put('tail_mid_a', v(0, 0.097, -0.165)); put('tail_mid_b', v(0, 0.099, -0.178)); put('tail_tip', v(0, 0.1, -0.19))
  const coat = (point: Vector3, normal: Vector3): RGB => normal.y < -0.62 && point.y < chest.y ? belly : fur
  const body = new SculptBody({bone: bone('spine'), paint: coat, detail: 1, blend: 0.05 * s})
  const torso = body.root
  torso.ellipsoid('haunch', v(0, 0.125, -0.085), [0.093 * s * girth * haunch, 0.092 * s * haunch, 0.083 * s], {bone: bone('pelvis'), forward: new Vector3(0, 0.25, 1)})
  torso.ellipsoid('loin', v(0, 0.15, -0.01), [0.08 * s * girth, 0.083 * s, 0.075 * s], {bone: bone('spine')})
  torso.ellipsoid('chest', v(0, 0.13, 0.06), [0.078 * s * girth, 0.076 * s, 0.07 * s], {bone: bone('chest'), forward: new Vector3(0, -0.35, 1)})
  torso.ellipsoid('neck', v(0, 0.18, 0.085), [0.05 * s * girth, 0.05 * s, 0.045 * s], {bone: bone('neck')})
  const H = s * headRatio
  const skull = torso.attach('head', {bone: bone('head'), join: 0.03 * s, blend: 0.022 * s})
  skull.ellipsoid('cranium', v(0, 0.217, 0.132), [0.045 * H, 0.05 * H, 0.054 * H], {forward: new Vector3(0, -0.3, 1)})
  for (const side of [1, -1]) skull.ellipsoid('cheek', v(side * 0.021 * headRatio, 0.19, 0.15), [0.03 * H, 0.032 * H, 0.038 * H], {forward: new Vector3(side * 0.2, -0.2, 1)})
  skull.ellipsoid('muzzle', v(0, 0.188, 0.178), [0.025 * H, 0.025 * H, 0.025 * H])
  const noseTip = skull.surface(v(0, 0.19, 0.17), new Vector3(0, 0.15, 1))
  const face = skull.attach('nose', {detail: 3, join: 0.006 * s, blend: 0.004 * s})
  face.ellipsoid('pad', noseTip.clone().add(new Vector3(0, 0.001 * s, -0.003 * s)), [0.0085 * H, 0.0055 * H, 0.0045 * H], {forward: new Vector3(0, 0.3, 1)})
  skull.paint('nose', noseTip.clone().add(new Vector3(0, 0.001 * s, 0)), [0.0105 * H, 0.0068 * H, 0.009 * H], {paint: nose, detail: 6, forward: new Vector3(0, 0.3, 1)})
  skull.paint('mouth', noseTip.clone().add(new Vector3(0, -0.01 * s, -0.003 * s)), [0.0028 * H, 0.0095 * H, 0.009 * H], {paint: nose, detail: 6, forward: new Vector3(0, 0.3, 1)})
  const eyeLift = new Vector3(0, 0.25, 0.32)
  for (const side of [1, -1] as const) {
    const suffix = side > 0 ? 'l' : 'r'
    const toward = new Vector3(side, 0, 0).add(eyeLift).normalize()
    const seat = skull.surface(v(side * 0.01, 0.228, 0.142), toward)
    const out = toward.clone()
    const eye = skull.attach('eye_' + suffix, {detail: 3, join: 0.005 * s, blend: 0.003 * s})
    eye.ellipsoid('bulge', seat.clone().addScaledVector(out, -0.002 * s), [0.0105 * H, 0.0098 * H, 0.0048 * H], {forward: out, up: new Vector3(0, 1, 0)})
    skull.decal('eye_' + suffix, seat, out, [{radius: 0.0145 * H, paint: ring}, {radius: 0.0108 * H, paint: dark}, {radius: 0.0094 * H, paint: iris}, {radius: 0.005 * H, paint: pupil}], {up: new Vector3(0, 1, 0), stretch: 1.12, segments: 14, detail: 4})
    skull.paint('glint_' + suffix, seat.clone().addScaledVector(out, 0.003 * s).add(new Vector3(0, 0.0042 * s, 0.0032 * s)), [0.0026 * H, 0.0026 * H, 0.004 * H], {paint: cream, detail: 4})
    const earLength = 0.125 * s * (earRatio / 0.62) * (earStyle === 'swept' ? 0.95 : earStyle === 'lop' ? 0.9 : 1)
    const earBase = skull.surface(v(side * 0.012, 0.225, 0.11), new Vector3(side * (earStyle === 'lop' ? 0.9 : 0.45), 1, -0.2)).addScaledVector(new Vector3(0, 1, 0), -0.006 * s)
    if (earStyle === 'lop') earBase.x += side * 0.018 * s
    const earDir = (earStyle === 'lop' ? new Vector3(side * 0.5, -0.84, 0.2) : earStyle === 'swept' ? new Vector3(side * 0.2, 0.5, -0.84) : new Vector3(side * 0.33, 0.9, -0.29)).normalize()
    const facing = (earStyle === 'lop' ? new Vector3(-side, 0.1, 0.25) : earStyle === 'swept' ? new Vector3(side * 0.9, 0.35, 0.2) : new Vector3(side * 0.78, -0.08, 0.62))
    facing.addScaledVector(earDir, -facing.dot(earDir)).normalize()
    const earBone = bone('ear_' + suffix)
    put('ear_' + suffix, earBase.clone())
    const earPaint = (point: Vector3): RGB => earTips && point.distanceTo(earBase) > earLength * 0.78 ? tip : fur
    const ear = skull.attach('ear_' + suffix, {bone: earBone, paint: earPaint, detail: 3.5, join: 0.014 * s, blend: 0.01 * s})
    const width = 0.031 * s * Math.sqrt(earRatio / 0.62), thick = 0.0095 * s
    ear.ellipsoid('leaf', earBase.clone().addScaledVector(earDir, earLength * 0.47), [width, thick, earLength * 0.55], {forward: earDir, up: facing, taper: -0.22})
    ear.carve('cup', earBase.clone().addScaledVector(earDir, earLength * 0.55).addScaledVector(facing, thick * 1.2), [width * 0.6, thick * 0.6, earLength * 0.33], {forward: earDir, up: facing, taper: -0.22, blend: 0.003 * s})
    ear.paint('inner', earBase.clone().addScaledVector(earDir, earLength * 0.56).addScaledVector(facing, thick * 1.5), [width * 0.66, thick * 1.25, earLength * 0.42], {forward: earDir, up: facing, taper: -0.22, paint: innerEar, detail: 3.5})
  }
  const tail = torso.attach('tail', {bone: bone('tail_mid_a'), paint: cream, join: 0.012 * s, blend: 0.01 * s})
  tail.ellipsoid('puff', v(0, 0.092, -0.168), [0.03 * s, 0.031 * s, 0.026 * s], {bone: bone('tail_mid_b'), forward: new Vector3(0, 0.45, -1)})
  const leg = (y: number) => y * s * legRatio
  for (const side of [1, -1] as const) {
    const suffix = side > 0 ? 'l' : 'r', x = (value: number) => side * value * s * (0.94 + 0.06 * girth)
    put('scapula_' + suffix, v(x(0.034) / s, 0.152, 0.07))
    const shoulder = put('front_upper_' + suffix, v(x(0.042) / s, 0.122, 0.058))
    const elbow = put('front_lower_' + suffix, new Vector3(x(0.043), leg(0.06) + lift * 0.8, 0.045 * s))
    const wrist = new Vector3(x(0.041), leg(0.022), 0.08 * s)
    put('front_paw_' + suffix, new Vector3(x(0.039), 0.009 * s, 0.1 * s))
    const front = torso.attach('front_' + suffix, {bone: bone('front_upper_' + suffix), join: 0.028 * s, blend: 0.012 * s})
    front.limb('arm', [shoulder, elbow, wrist, new Vector3(x(0.039), 0.012 * s, 0.092 * s)], [0.026 * s * girth, 0.02 * s * girth, 0.0165 * s, 0.0155 * s], {bones: [bone('front_upper_' + suffix), bone('front_lower_' + suffix), bone('front_lower_' + suffix)]})
    front.ellipsoid('paw', new Vector3(x(0.039), 0.009 * s, 0.106 * s), [0.0165 * s, 0.0115 * s, 0.024 * s], {bone: bone('front_paw_' + suffix)})
    const thigh = put('hind_thigh_' + suffix, new Vector3(x(0.058), pelvis.y - 0.025 * s, -0.07 * s))
    const knee = put('hind_shin_' + suffix, new Vector3(x(0.074), 0.062 * s + lift * 0.6, -0.058 * s))
    const heel = put('hind_hock_' + suffix, new Vector3(x(0.078), 0.018 * s, -0.104 * s))
    const toe = put('hind_paw_' + suffix, new Vector3(x(0.079), 0.009 * s, -0.012 * s))
    const hind = torso.attach('hind_' + suffix, {bone: bone('hind_thigh_' + suffix), join: 0.035 * s, blend: 0.016 * s})
    hind.ellipsoid('thigh', new Vector3(x(0.066), 0.088 * s + lift * 0.7, -0.07 * s), [0.034 * s * girth * haunch, 0.046 * s * haunch, 0.052 * s * haunch], {forward: new Vector3(0, -0.55, 1)})
    hind.limb('shin', [knee, heel], [0.016 * s, 0.013 * s], {bone: bone('hind_shin_' + suffix)})
    hind.limb('foot', [heel, new Vector3(x(0.079), 0.012 * s, -0.05 * s), new Vector3(x(0.079), 0.011 * s, 0.004 * s)], [0.016 * s, 0.0145 * s, 0.0125 * s], {bones: [bone('hind_hock_' + suffix), bone('hind_paw_' + suffix)]})
    void thigh; void toe
  }
  const result = body.build({triangles: 1960, cell: 0.0055 * s, floor: 0, jitter: 0.035})
  const topology = result.topology
  if (topology.shells !== 1 || topology.boundaryEdges || topology.windingErrors) throw new Error('Rabbit coat is not one closed surface (' + JSON.stringify(topology) + ')')
  if (result.triangles < 1600 || result.triangles > 3400) throw new Error('Rabbit triangle count ' + result.triangles + ' is outside 1600-3400')
  const frontGap = result.separation(bone('front_lower_l'), bone('front_lower_r')), hindGap = result.separation(bone('hind_hock_l'), bone('hind_hock_r')), earGap = result.separation(bone('ear_l'), bone('ear_r'))
  if (frontGap < 0.012 * s) throw new Error('Rabbit front legs intersect at ' + frontGap.toFixed(4))
  if (hindGap < 0.012 * s) throw new Error('Rabbit hind legs intersect at ' + hindGap.toFixed(4))
  if (earGap < 0.004 * s) throw new Error('Rabbit ears intersect at ' + earGap.toFixed(4))
  const low = result.minY(); if (!Number.isFinite(low)) throw new Error('Rabbit surface is empty')
  if (Math.abs(low) > 1e-6) { result.shiftY(-low); for (const point of points.values()) if (point.lengthSq() > 0) point.y -= low }
  const pawNames = ['front_paw_l', 'front_paw_r', 'hind_paw_l', 'hind_paw_r']
  const pawHeight = Math.max(0.008 * s, ...pawNames.map(name => { const point = points.get(name); if (!point) throw new Error('Missing paw ' + name); return point.y }))
  for (const name of pawNames) points.get(name)!.y = pawHeight
  const root = new Group(); root.name = 'rigged-rabbit'
  const bones: Bone[] = [], byName = new Map<string, Bone>()
  for (const name of names) {
    const node = new Bone(), point = points.get(name); if (!point) throw new Error('Missing rabbit point ' + name)
    node.name = name; node.position.copy(point)
    const fromName = parent[name]
    if (fromName) {
      const from = points.get(fromName), parentNode = byName.get(fromName)
      if (!from || !parentNode) throw new Error('Missing rabbit parent ' + name)
      node.position.sub(from); parentNode.add(node)
    } else root.add(node)
    bones.push(node); byName.set(name, node)
  }
  const geometry = result.geometry()
  const material = new MeshStandardMaterial({name: 'fur', color: '#ffffff', roughness: 0.9, metalness: 0, flatShading: true, vertexColors: true})
  const skinned = new SkinnedMesh(geometry, material)
  skinned.name = 'rabbit-coat'; skinned.userData.materialRole = 'fur'; skinned.castShadow = true; skinned.receiveShadow = true
  root.add(skinned); root.updateMatrixWorld(true)
  const skeleton = new Skeleton(bones); skinned.bind(skeleton); skeleton.update()
  const chains: RigMetadata['chains'] = [], effectors: NonNullable<RigMetadata['effectors']> = []
  const groundPoint = points.get('front_paw_l'); if (!groundPoint || groundPoint.y <= 0) throw new Error('Rabbit paws are below ground')
  for (const suffix of ['l', 'r']) for (const pair of ['front', 'hind'] as const) {
    const upper = (pair === 'front' ? 'front_upper_' : 'hind_thigh_') + suffix
    const lower = (pair === 'front' ? 'front_lower_' : 'hind_shin_') + suffix
    const end = (pair === 'front' ? 'front_paw_' : 'hind_hock_') + suffix
    const paw = pair + '_paw_' + suffix
    const endPoint = points.get(end), pawPoint = points.get(paw)
    if (!endPoint || !pawPoint) throw new Error('Missing effector ' + paw)
    chains.push({upper, lower, end, side: suffix === 'l' ? 'left' : 'right'})
    effectors.push({id: pair + '_' + suffix, bone: paw, chain: upper, offset: endPoint.clone().sub(pawPoint).toArray() as [number, number, number], groundOffset: groundPoint.y})
  }
  const bounds = new Box3().setFromObject(root)
  const anchors = {ground: [0, 0, 0] as [number, number, number], head: head.toArray() as [number, number, number]}
  const rig: RigMetadata = {version: 1, kind: 'fox', bones: bones.map(node => ({name: node.name, parent: node.parent instanceof Bone ? node.parent.name : null})), meshes: ['rabbit-coat'], chains, effectors, clips: []}
  root.userData = {configuration: config, units: 'meters', up: '+Y', forward: '+Z', origin: 'ground-center', anchors}
  return {root, config, materials: {fur: material}, bounds, dimensions: bounds.getSize(new Vector3()), anchors, rig}
}
function finalize(asset: SemanticAssetBuild) {
  const built = asset as RiggedAssetBuild;
  validateRig(built.root, built.rig); built.root.userData.openpolyRig = built.rig; createFoxMotion(built); validateRigMotion(built.root, built.rig);
}
export const rabbitRecipe: Recipe = {
  descriptor: {
    id: 'rigged-rabbit', version: '1.0.0', title: 'Stylized rabbit',
    description: 'Faceted wild rabbit with a short muzzle, cream belly, cotton tail and long ears.',
    controls, defaults: parseControls(controls, {}),
    presets: [
      {id: 'cottontail', name: 'Cottontail', description: 'Brown wild rabbit with upright ears and a white cotton tail.', parameters: {}},
      {id: 'lop', name: 'Lop rabbit', description: 'Stocky grey-and-white pet rabbit with lop ears hanging beside a big head.', parameters: {earStyle: 'lop', build: 'stocky', earRatio: 0.7, headRatio: 1.15, haunch: 1.15, legRatio: 0.85, bodyLength: 0.32, 'color.fur': '#8f8f93', 'color.cream': '#f4f2ee', 'color.dark': '#262426'}},
      {id: 'hare', name: 'Hare', description: 'Lean long-legged tawny hare with long swept ears and black tips.', parameters: {earStyle: 'swept', build: 'lean', earRatio: 1, legRatio: 1.28, haunch: 0.95, headRatio: 0.92, bodyLength: 0.46, earTips: true, 'color.fur': '#b98a52', 'color.cream': '#efe3cb', 'color.dark': '#221d1a'}},
    ],
    palettes: [], save, state: input => parameterState(controls, input),
  },
  build, load, finalize, validationCases: [{id: 'default', name: 'Default proportions', parameters: {}}], integrationCases: [],
  constraints: ['Flat-ground paw contact only', 'Shares the four-paw quadruped rig contract with the fox'],
  presentation: {category: 'Animals', order: 102, kitIds: []},
  source: {entry: 'examples/recipes/stylized-rabbit/index.ts', exportName: 'rabbitRecipe'},
};

