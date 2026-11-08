import { BufferGeometry,Float32BufferAttribute,Uint16BufferAttribute,Vector3 } from 'three';
export interface SkinStation {right?:Vector3;center:Vector3;radiusX:number;radiusY:number;weights:[number,number][]}
export function skinGeometry(stations:SkinStation[],segments=8,flattenFloor=false,caps:{start?:boolean;end?:boolean}={}):BufferGeometry {
  if(stations.length<2||segments<6)throw new Error('Skin loft requires rings');
  const positions:number[]=[],indices:number[]=[],weights:number[]=[],joints:number[]=[];
  function vertex(point:Vector3,influences:[number,number][]){
    positions.push(point.x,flattenFloor?Math.max(0,point.y):point.y,point.z);
    for(let i=0;i<4;i++){const weight=influences[i]?.[1]??0;joints.push(weight>0?influences[i]![0]:0);weights.push(weight);}
  }
  for(let i=0;i<stations.length;i++){
    const station=stations[i]!,tangent=stations[Math.min(i+1,stations.length-1)]!.center.clone().sub(stations[Math.max(0,i-1)]!.center).normalize();
    const axis=Math.abs(tangent.z)<.9?new Vector3(0,0,1):new Vector3(0,1,0),right=station.right?station.right.clone().addScaledVector(tangent,-station.right.dot(tangent)).normalize():axis.cross(tangent).normalize(),up=tangent.clone().cross(right).normalize();
    for(let j=0;j<segments;j++){const angle=j/segments*Math.PI*2;vertex(station.center.clone().addScaledVector(right,Math.cos(angle)*station.radiusX).addScaledVector(up,Math.sin(angle)*station.radiusY),station.weights);}
    if(i)for(let j=0;j<segments;j++){const a=(i-1)*segments+j,b=(i-1)*segments+(j+1)%segments,c=i*segments+j,d=i*segments+(j+1)%segments;indices.push(a,b,c,b,d,c);}
  }
  if(caps.start!==false){const start=positions.length/3;vertex(stations[0]!.center,stations[0]!.weights);for(let j=0;j<segments;j++)indices.push(start,(j+1)%segments,j);}
  if(caps.end!==false){const end=positions.length/3;vertex(stations.at(-1)!.center,stations.at(-1)!.weights);for(let j=0;j<segments;j++){const offset=(stations.length-1)*segments;indices.push(end,offset+j,offset+(j+1)%segments);}}
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('skinIndex',new Uint16BufferAttribute(joints,4));geometry.setAttribute('skinWeight',new Float32BufferAttribute(weights,4));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
export function combineSkins(parts:BufferGeometry[]):BufferGeometry {
  const positions:number[]=[],weights:number[]=[],joints:number[]=[],indices:number[]=[];
  for(const part of parts){const offset=positions.length/3;positions.push(...part.getAttribute('position').array);weights.push(...part.getAttribute('skinWeight').array);joints.push(...part.getAttribute('skinIndex').array);indices.push(...Array.from(part.index!.array,index=>index+offset));part.dispose();}
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(positions,3));geometry.setAttribute('skinIndex',new Uint16BufferAttribute(joints,4));geometry.setAttribute('skinWeight',new Float32BufferAttribute(weights,4));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingBox();return geometry;
}

export function skinBand(stations:SkinStation[],thickness:number,segments=8):BufferGeometry {
  const outer=skinGeometry(stations,segments,false,{start:false,end:false}),inner=skinGeometry(stations.map(station=>({...station,radiusX:station.radiusX-thickness,radiusY:station.radiusY-thickness})),segments,false,{start:false,end:false});
  const inside=Array.from(inner.index!.array);for(let i=0;i<inside.length;i+=3)[inside[i+1],inside[i+2]]=[inside[i+2]!,inside[i+1]!];inner.setIndex(inside);
  const geometry=combineSkins([outer,inner]),indices=Array.from(geometry.index!.array),offset=stations.length*segments,last=(stations.length-1)*segments;
  for(let j=0;j<segments;j++){const next=(j+1)%segments;indices.push(j,offset+j,next,offset+j,offset+next,next,last+j,last+next,offset+last+j,offset+last+j,last+next,offset+last+next);}
  geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
export function skinPolyhedron(points:Vector3[],indices:number[],bone:number):BufferGeometry {
  const geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(points.flatMap(point=>point.toArray()),3));geometry.setAttribute('skinIndex',new Uint16BufferAttribute(points.flatMap(()=>[bone,0,0,0]),4));geometry.setAttribute('skinWeight',new Float32BufferAttribute(points.flatMap(()=>[1,0,0,0]),4));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}


export type SkinWeight = [number, number]
export type SkinRGB = [number, number, number]
export interface SkinSection {
  center: Vector3
  rx: number
  ry: number
  weights: SkinWeight[]
  color?: (angle: number) => SkinRGB
  scale?: (angle: number) => number
  axisScale?: (angle: number) => [number, number]
  shift?: (angle: number) => Vector3
}

export interface SkinBranch {
  point: Vector3
  rx: number
  ry: number
  weights: SkinWeight[]
  color?: SkinRGB | ((angle: number) => SkinRGB)
  up?: Vector3
}


export function radialDent(angle: number, center: number, width: number, depth: number): number {
  if (!(width > 0)) return 1
  const delta = Math.atan2(Math.sin(angle - center), Math.cos(angle - center))
  const unit = Math.abs(delta) / width
  if (unit >= 1) return 1
  const falloff = 1 - unit
  return 1 - depth * falloff * falloff
}

export function orientedFrame(tangent: Vector3, upHint?: Vector3): { right: Vector3, up: Vector3 } {
  const axis = tangent.clone().normalize()
  const hint = upHint ?? new Vector3(0, 1, 0)
  const right = hint.clone().cross(axis)
  if (right.lengthSq() < 1e-8) {
    const helper = Math.abs(axis.z) > 0.9 ? new Vector3(0, 1, 0) : new Vector3(0, 0, 1)
    const side = helper.cross(axis).normalize()
    return { right: side, up: axis.clone().cross(side).normalize() }
  }
  right.normalize()
  return { right, up: axis.clone().cross(right).normalize() }
}

export class SkinMesh {
  private positions: number[] = []
  private joints: number[] = []
  private weights: number[] = []
  private colors: number[] = []
  private indices: number[] = []
  constructor(private readonly colorEnabled = false) {}
  get triangles(): number { return this.indices.length / 3 }
  add(point: Vector3, weights: SkinWeight[], color?: SkinRGB): number {
    const index = this.positions.length / 3
    this.positions.push(point.x, point.y, point.z)
    const skin = this.influences(weights)
    this.joints.push(...skin.joints)
    this.weights.push(...skin.values)
    const paint = color ?? [1, 1, 1]
    this.colors.push(paint[0], paint[1], paint[2])
    return index
  }
  position(index: number): Vector3 {
    const offset = index * 3
    return new Vector3(this.positions[offset], this.positions[offset + 1], this.positions[offset + 2])
  }
  setPosition(index: number, point: Vector3): void {
    const offset = index * 3
    this.positions[offset] = point.x
    this.positions[offset + 1] = point.y
    this.positions[offset + 2] = point.z
  }
  setColor(index: number, color: SkinRGB): void {
    const offset = index * 3
    this.colors[offset] = color[0]
    this.colors[offset + 1] = color[1]
    this.colors[offset + 2] = color[2]
  }
  setWeights(index: number, weights: SkinWeight[]): void {
    const skin = this.influences(weights)
    const offset = index * 4
    for (let i = 0; i < 4; i++) {
      this.joints[offset + i] = skin.joints[i]!
      this.weights[offset + i] = skin.values[i]!
    }
  }
  loop(count: number, at: (index: number) => Vector3, weights: SkinWeight[] | ((index: number) => SkinWeight[]), color?: SkinRGB | ((index: number) => SkinRGB)): number[] {
    if (count < 3) throw new Error('Skin loop is too small')
    const ring: number[] = []
    for (let i = 0; i < count; i++) ring.push(this.add(at(i), typeof weights === 'function' ? weights(i) : weights, typeof color === 'function' ? color(i) : color))
    return ring
  }
  ellipse(center: Vector3, right: Vector3, up: Vector3, rx: number, ry: number, count: number, weights: SkinWeight[] | ((index: number) => SkinWeight[]), color?: SkinRGB | ((index: number) => SkinRGB)): number[] {
    return this.loop(count, i => {
      const angle = i / count * Math.PI * 2
      return center.clone().addScaledVector(right, Math.cos(angle) * rx).addScaledVector(up, Math.sin(angle) * ry)
    }, weights, color)
  }
  sweep(sections: SkinSection[], segments: number): number[][] {
    if (sections.length < 2 || segments < 3) throw new Error('Skin part is too short')
    const rings = sections.map((section, index) => {
      const before = sections[Math.max(0, index - 1)]
      const after = sections[Math.min(sections.length - 1, index + 1)]
      if (!before || !after) throw new Error('Skin part is too short')
      const tangent = after.center.clone().sub(before.center)
      if (tangent.lengthSq() < 1e-10) tangent.set(0, 0, 1)
      else tangent.normalize()
      const frame = orientedFrame(tangent)
      const at = (i: number) => {
        const angle = i / segments * Math.PI * 2
        const scale = section.scale ? section.scale(angle) : 1
        const axes: [number, number] = section.axisScale ? section.axisScale(angle) : [1, 1]
        if (!Number.isFinite(scale) || !(scale > 0) || !axes.every(value => Number.isFinite(value) && value > 0)) throw new Error('Skin section scale collapsed')
        const point = section.center.clone().addScaledVector(frame.right, Math.cos(angle) * section.rx * scale * axes[0]!).addScaledVector(frame.up, Math.sin(angle) * section.ry * scale * axes[1]!)
        const extra = section.shift ? section.shift(angle) : undefined
        if (extra) point.add(extra)
        return point
      }
      const paint = section.color
      if (paint) return this.loop(segments, at, section.weights, i => paint(i / segments * Math.PI * 2))
      return this.loop(segments, at, section.weights)
    })
    for (let i = 0; i < rings.length - 1; i++) {
      const a = sections[i]!.center, b = sections[i + 1]!.center
      const axis = b.clone().sub(a)
      if (axis.lengthSq() < 1e-10) continue
      axis.normalize()
      const mid = a.clone().lerp(b, 0.5)
      for (const index of rings[i]!) {
        const point = this.position(index)
        const excess = point.clone().sub(mid).dot(axis)
        if (excess > 0) this.setPosition(index, point.addScaledVector(axis, -excess))
      }
      for (const index of rings[i + 1]!) {
        const point = this.position(index)
        const excess = point.clone().sub(mid).dot(axis)
        if (excess < 0) this.setPosition(index, point.addScaledVector(axis, -excess))
      }
    }
    return rings
  }
  centroid(loop: number[]): Vector3 {
    const center = new Vector3()
    for (const index of loop) center.add(this.position(index))
    return center.multiplyScalar(1 / loop.length)
  }
  extrude(loop: number[], offset: Vector3, weights: SkinWeight[] | ((index: number) => SkinWeight[]), color?: SkinRGB | ((index: number, source: number) => SkinRGB)): number[] {
    return loop.map((source, index) => this.add(this.position(source).add(offset), typeof weights === 'function' ? weights(index) : weights, typeof color === 'function' ? color(index, source) : color ?? this.colorOf(source)))
  }
  bridge(a: number[], b: number[], inside: Vector3): void {
    if (a.length !== b.length || a.length < 3) throw new Error('Skin loops differ')
    const flip = this.patchFlip(a, b, inside)
    for (let segment = 0; segment < a.length; segment++) this.quad(a, b, segment, flip)
  }
  bridgeExcept(a: number[], b: number[], gaps: { start: number, count: number }[], inside: Vector3): number[][] {
    if (a.length !== b.length || a.length < 4) throw new Error('Skin loops differ')
    const count = a.length
    const blocked = new Set<number>()
    for (const gap of gaps) {
      if (gap.count < 1 || gap.count >= count - 1) throw new Error('Skin gap is invalid')
      for (let i = 0; i < gap.count; i++) {
        const segment = (gap.start + i) % count
        if (blocked.has(segment)) throw new Error('Skin gaps overlap at segment ' + segment)
        blocked.add(segment)
      }
    }
    const flip = this.patchFlip(a, b, inside, blocked)
    for (let segment = 0; segment < count; segment++) if (!blocked.has(segment)) this.quad(a, b, segment, flip)
    return gaps.map(gap => this.hole(a, b, gap.start, gap.count))
  }
  centeredGap(loop: number[], direction: Vector3, count: number): { start: number, count: number } {
    const center = this.centroid(loop)
    let best = 0
    let bestScore = -Infinity
    for (let i = 0; i < loop.length; i++) {
      const score = this.position(loop[i]!).sub(center).dot(direction)
      if (score > bestScore) { bestScore = score; best = i }
    }
    const start = best - Math.floor(count / 2)
    const span = loop.length
    return { start: ((start % span) + span) % span, count }
  }
  bridgeOutward(a: number[], b: number[], outward: Vector3): void {
    this.bridge(a, b, this.centroid(a).add(outward.clone().multiplyScalar(0.5)))
  }
  alignBridge(source: number[], target: number[], inside: Vector3): void {
    if (source.length !== target.length || source.length < 3) throw new Error('Skin graft differs')
    const count = source.length
    const origin = source.map(index => this.position(index))
    let best: number[] | null = null
    let bestCost = Infinity
    for (const direction of [1, -1]) for (let shift = 0; shift < count; shift++) {
      const ordered: number[] = []
      let cost = 0
      for (let i = 0; i < count; i++) {
        const index = target[((shift + direction * i) % count + count) % count]!
        ordered.push(index)
        cost += origin[i]!.distanceToSquared(this.position(index))
      }
      if (cost < bestCost) { bestCost = cost; best = ordered }
    }
    this.bridge(source, best!, inside)
  }
  branch(hole: number[], profiles: SkinBranch[], guide?: Vector3): number[] {
    if (hole.length < 3 || profiles.length < 1) throw new Error('Skin branch is too short')
    for (const profile of profiles) if (!(profile.rx > 0) || !(profile.ry > 0)) throw new Error('Skin branch section collapsed')
    const first = profiles[0]!
    const origin = this.centroid(hole)
    const aim = first.point.clone().sub(origin)
    const reach = aim.length()
    if (reach < 1e-4) throw new Error('Skin branch is too short')
    const direction = aim.clone().multiplyScalar(1 / reach)
    let normal = this.loopNormal(hole)
    if (normal.dot(direction) < -0.35) normal.negate()
    const mouth = this.opening(hole, normal, first.up ?? guide)
    const startAngle = Math.atan2(mouth.vs[0]! / first.ry, mouth.us[0]! / first.rx)
    const targets = hole.map((_, index) => startAngle + mouth.sign * index / hole.length * Math.PI * 2)
    let right = mouth.right
    let up = mouth.up
    let tangent = normal
    let ring = hole
    let previousPoint = origin
    const paintOf = (paint: SkinBranch['color']) => paint ? (index: number) => typeof paint === 'function' ? paint(targets[index]!) : paint : (index: number) => this.colorOf(hole[index]!)
    const exit = origin.clone().addScaledVector(normal, Math.min(mouth.mean * 1.4, reach))
    const curvePoint = (t: number) => origin.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(exit, 2 * (1 - t) * t).addScaledVector(first.point, t * t)
    const samples: {t: number, at: number}[] = [{t: 0, at: 0}]
    let sampled = curvePoint(0)
    let curveLength = 0
    for (let i = 1; i <= 12; i++) {
      const next = curvePoint(i / 12)
      curveLength += next.distanceTo(sampled)
      samples.push({t: i / 12, at: curveLength})
      sampled = next
    }
    for (const fraction of [1 / 3, 2 / 3]) {
      const wanted = curveLength * fraction
      let t = 1
      for (let i = 1; i < samples.length; i++) if (samples[i]!.at >= wanted) { t = samples[i]!.t; break }
      const stepTangent = exit.clone().sub(origin).multiplyScalar(1 - t).add(first.point.clone().sub(exit).multiplyScalar(t))
      if (stepTangent.lengthSq() < 1e-8) stepTangent.copy(direction)
      stepTangent.normalize()
      const carried = this.transportFrame(tangent, right, up, stepTangent)
      right = carried.right
      up = carried.up
      tangent = stepTangent
      const center = curvePoint(t)
      const blend = fraction * fraction * (3 - 2 * fraction)
      const grown = this.loop(hole.length, index => {
        const target = targets[index]!
        const across = mouth.us[index]! + (Math.cos(target) * first.rx - mouth.us[index]!) * blend
        const along = mouth.vs[index]! + (Math.sin(target) * first.ry - mouth.vs[index]!) * blend
        return center.clone().addScaledVector(right, across).addScaledVector(up, along).addScaledVector(tangent, mouth.axial[index]! * (1 - fraction))
      }, first.weights, paintOf(first.color))
      this.bridge(ring, grown, previousPoint.clone().lerp(center, 0.5))
      ring = grown
      previousPoint = center
    }
    let previousRx = first.rx
    let previousRy = first.ry
    let previousWeights = first.weights
    const jointTangents = profiles.map((profile, index) => {
      const before = index === 0 ? previousPoint : profiles[index - 1]!.point
      const incoming = profile.point.clone().sub(before)
      if (incoming.lengthSq() > 1e-10) incoming.normalize()
      const next = profiles[index + 1]
      if (!next) return incoming.lengthSq() > 0 ? incoming : tangent.clone()
      const outgoing = next.point.clone().sub(profile.point)
      if (outgoing.lengthSq() > 1e-10) outgoing.normalize()
      const bisector = incoming.clone().add(outgoing)
      return bisector.lengthSq() > 1e-8 ? bisector.normalize() : incoming
    })
    for (let profileIndex = 0; profileIndex < profiles.length; profileIndex++) {
      const profile = profiles[profileIndex]!
      const startPoint = previousPoint
      const startTangent = tangent
      const stepTangent = jointTangents[profileIndex]!
      const carried = this.transportFrame(tangent, right, up, stepTangent)
      let roll = 0
      if (profile.up) {
        const aimed = this.aimUp(stepTangent, profile.up, carried.right, carried.up)
        roll = Math.atan2(carried.up.clone().cross(aimed.up).dot(stepTangent), Math.min(1, Math.max(-1, carried.up.dot(aimed.up))))
      }
      const turn = Math.acos(Math.min(1, Math.max(-1, startTangent.dot(stepTangent))))
      const steps = Math.min(3, Math.max(1, Math.ceil(Math.max(turn, Math.abs(roll)) / 0.75)))
      for (let step = 1; step <= steps; step++) {
        const fraction = step / steps
        const subTangent = startTangent.clone().lerp(stepTangent, fraction)
        if (subTangent.lengthSq() < 1e-8) subTangent.copy(stepTangent)
        subTangent.normalize()
        const moved = this.transportFrame(tangent, right, up, subTangent)
        right = moved.right
        up = moved.up
        tangent = subTangent
        if (roll) {
          right = right.clone().applyAxisAngle(tangent, roll / steps)
          up = tangent.clone().cross(right).normalize()
        }
        if (Math.abs(right.dot(up)) > 0.08 || Math.abs(right.dot(tangent)) > 0.08) throw new Error('Skin branch frame collapsed')
        const center = startPoint.clone().lerp(profile.point, fraction)
        const rx = previousRx + (profile.rx - previousRx) * fraction
        const ry = previousRy + (profile.ry - previousRy) * fraction
        const grown = this.loop(hole.length, index => {
          const target = targets[index]!
          return center.clone().addScaledVector(right, Math.cos(target) * rx).addScaledVector(up, Math.sin(target) * ry)
        }, step === steps ? profile.weights : previousWeights, paintOf(profile.color))
        this.bridge(ring, grown, previousPoint.clone().lerp(center, 0.5))
        ring = grown
        previousPoint = center
      }
      previousRx = profile.rx
      previousRy = profile.ry
      previousWeights = profile.weights
    }
    return ring
  }
  seatRound(hole: number[], outward: Vector3, radius: number, weights: SkinWeight[], iris: SkinRGB, rim?: SkinRGB, core?: SkinRGB): number {
    if (hole.length < 3 || !(radius > 0)) throw new Error('Skin eye is too small')
    const axis = outward.clone()
    if (axis.lengthSq() < 1e-8) throw new Error('Skin eye is too small')
    axis.normalize()
    const mouth = this.opening(hole, axis, new Vector3(0, 1, 0))
    if (radius < mouth.mean * 0.2 || radius > mouth.mean * 4) throw new Error('Skin eye does not fit its opening')
    const startAngle = Math.atan2(mouth.vs[0]!, mouth.us[0]!)
    const targets = hole.map((_, index) => startAngle + mouth.sign * index / hole.length * Math.PI * 2)
    if (rim) for (const index of hole) this.setColor(index, rim)
    const root = this.centroid(hole)
    const cavity = root.clone().addScaledVector(axis, -radius)
    let previous = hole
    let previousAlong = 0
    const steps: {along: number, size: number, color: SkinRGB, blend: number, axial: number}[] = [
      {along: 0.16, size: 1.04, color: rim ?? iris, blend: 0.7, axial: 0.3},
      {along: 0.44, size: 0.8, color: iris, blend: 1, axial: 0},
      {along: 0.68, size: 0.46, color: iris, blend: 1, axial: 0},
    ]
    for (const step of steps) {
      const center = root.clone().addScaledVector(axis, radius * step.along)
      const ring = this.loop(hole.length, index => {
        const target = targets[index]!
        const across = mouth.us[index]! + (Math.cos(target) * radius * step.size - mouth.us[index]!) * step.blend
        const along = mouth.vs[index]! + (Math.sin(target) * radius * step.size - mouth.vs[index]!) * step.blend
        return center.clone().addScaledVector(mouth.right, across).addScaledVector(mouth.up, along).addScaledVector(axis, mouth.axial[index]! * step.axial)
      }, weights, step.color)
      this.bridge(previous, ring, root.clone().addScaledVector(axis, radius * (previousAlong + step.along) / 2))
      previous = ring
      previousAlong = step.along
    }
    return this.cap(previous, root.clone().addScaledVector(axis, radius * 0.82), weights, cavity, core ?? iris)
  }
  cap(loop: number[], center: Vector3, weights: SkinWeight[], inside: Vector3, color?: SkinRGB): number {
    const hub = this.add(center, weights, color)
    let score = 0
    for (let i = 0; i < loop.length; i++) score += this.faceScore(hub, loop[i]!, loop[(i + 1) % loop.length]!, inside)
    const flip = score < 0
    for (let i = 0; i < loop.length; i++) this.face(hub, loop[i]!, loop[(i + 1) % loop.length]!, flip)
    return hub
  }
  domeCap(loop: number[], direction: Vector3, length: number, weights: SkinWeight[], color?: SkinRGB, steps = 3): number {
    if (loop.length < 3 || !(length > 0)) throw new Error('Skin dome is too small')
    if (!Number.isInteger(steps) || steps < 1 || steps > 8) throw new Error('Skin dome steps are invalid')
    const axis = direction.clone()
    if (axis.lengthSq() < 1e-8) throw new Error('Skin dome is too small')
    axis.normalize()
    const mouth = this.opening(loop, axis, new Vector3(0, 1, 0))
    const root = this.centroid(loop)
    let previous = loop
    let previousCenter = root
    for (let step = 1; step <= steps; step++) {
      const fraction = step / (steps + 1)
      const scale = Math.sqrt(Math.max(0.015, 1 - fraction * fraction))
      const center = root.clone().addScaledVector(axis, length * fraction)
      const ring = this.loop(loop.length, index => center.clone().addScaledVector(mouth.right, mouth.us[index]! * scale).addScaledVector(mouth.up, mouth.vs[index]! * scale).addScaledVector(axis, mouth.axial[index]! * (1 - fraction)), weights, color ?? ((vertex: number) => this.colorOf(loop[vertex]!)))
      this.bridge(previous, ring, previousCenter.clone().lerp(center, 0.5))
      previous = ring
      previousCenter = center
    }
    return this.cap(previous, root.clone().addScaledVector(axis, length), weights, root.clone().addScaledVector(axis, -Math.max(length, mouth.mean)), color)
  }
  seat(hole: number[], inset: Vector3, weights: SkinWeight[], iris: SkinRGB, rim?: SkinRGB, core?: SkinRGB): number {
    if (hole.length < 3) throw new Error('Skin seat needs a loop')
    if (rim) for (const index of hole) this.setColor(index, rim)
    const centroid = this.centroid(hole)
    const inner = hole.map(index => this.add(this.position(index).lerp(centroid, 0.58).add(inset), weights, iris))
    const deeper = centroid.clone().add(inset.clone().multiplyScalar(3))
    this.bridge(hole, inner, deeper)
    return this.cap(inner, centroid.clone().add(inset.clone().multiplyScalar(1.75)), weights, deeper, core ?? iris)
  }
  minY(): number {
    let y = Infinity
    for (let i = 1; i < this.positions.length; i += 3) y = Math.min(y, this.positions[i]!)
    return y
  }
  shiftY(delta: number): void {
    for (let i = 1; i < this.positions.length; i += 3) this.positions[i] = this.positions[i]! + delta
  }
  verticesWeighted(bone: number, minWeight = 0.5): Vector3[] {
    const found: Vector3[] = []
    const count = this.positions.length / 3
    for (let index = 0; index < count; index++) for (let slot = 0; slot < 4; slot++) if (this.joints[index * 4 + slot] === bone && this.weights[index * 4 + slot]! >= minWeight) { found.push(this.position(index)); break }
    return found
  }
  shells(): number {
    const parent = new Map<number, number>()
    const find = (value: number): number => {
      let root = value
      const seen: number[] = []
      while (parent.has(root) && parent.get(root) !== root) { seen.push(root); root = parent.get(root)! }
      if (!parent.has(root)) parent.set(root, root)
      for (const item of seen) parent.set(item, root)
      return root
    }
    const unite = (a: number, b: number) => { const left = find(a), right = find(b); if (left !== right) parent.set(left, right) }
    const used = new Set<number>()
    for (let i = 0; i < this.indices.length; i += 3) {
      const a = this.indices[i]!, b = this.indices[i + 1]!, c = this.indices[i + 2]!
      used.add(a); used.add(b); used.add(c); unite(a, b); unite(b, c)
    }
    const roots = new Set<number>()
    for (const vertex of used) roots.add(find(vertex))
    return roots.size
  }
  boundaryEdges(): number {
    const counts = new Map<string, number>()
    for (let i = 0; i < this.indices.length; i += 3) {
      const tri = [this.indices[i]!, this.indices[i + 1]!, this.indices[i + 2]!]
      for (let edge = 0; edge < 3; edge++) {
        const u = tri[edge]!, v = tri[(edge + 1) % 3]!
        const key = u < v ? u + ':' + v : v + ':' + u
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
    let boundary = 0
    for (const count of counts.values()) if (count !== 2) boundary++
    return boundary
  }
  windingErrors(): number {
    const edges = new Map<string, [number, number][]>()
    for (let i = 0; i < this.indices.length; i += 3) {
      const tri = [this.indices[i]!, this.indices[i + 1]!, this.indices[i + 2]!]
      for (let edge = 0; edge < 3; edge++) {
        const u = tri[edge]!, v = tri[(edge + 1) % 3]!
        const key = u < v ? u + ':' + v : v + ':' + u
        const entry = edges.get(key) ?? []
        entry.push([u, v])
        edges.set(key, entry)
      }
    }
    let errors = 0
    for (const entry of edges.values()) if (entry.length === 2 && entry[0]![0] === entry[1]![0]) errors++
    return errors
  }
  toGeometry(): BufferGeometry {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3))
    geometry.setAttribute('skinIndex', new Uint16BufferAttribute(this.joints, 4))
    geometry.setAttribute('skinWeight', new Float32BufferAttribute(this.weights, 4))
    if (this.colorEnabled) geometry.setAttribute('color', new Float32BufferAttribute(this.colors, 3))
    geometry.setIndex(this.indices)
    geometry.computeVertexNormals()
    const normal = geometry.getAttribute('normal')
    for (let i = 0; i < normal.count; i++) if (![normal.getX(i), normal.getY(i), normal.getZ(i)].every(Number.isFinite)) normal.setXYZ(i, 0, 1, 0)
    return geometry
  }
  private colorOf(index: number): SkinRGB {
    const offset = index * 3
    return [this.colors[offset]!, this.colors[offset + 1]!, this.colors[offset + 2]!]
  }
  private loopNormal(loop: number[]): Vector3 {
    const normal = new Vector3()
    for (let i = 0; i < loop.length; i++) {
      const a = this.position(loop[i]!), b = this.position(loop[(i + 1) % loop.length]!)
      normal.x += (a.y - b.y) * (a.z + b.z)
      normal.y += (a.z - b.z) * (a.x + b.x)
      normal.z += (a.x - b.x) * (a.y + b.y)
    }
    if (normal.lengthSq() < 1e-12) return new Vector3(0, 1, 0)
    return normal.normalize()
  }
  private opening(loop: number[], axis: Vector3, upSeed?: Vector3): { right: Vector3, up: Vector3, us: number[], vs: number[], axial: number[], mean: number, sign: number } {
    const normal = axis.clone().normalize()
    const center = this.centroid(loop)
    let up = upSeed ? upSeed.clone().addScaledVector(normal, -upSeed.dot(normal)) : new Vector3()
    let right: Vector3
    if (up.lengthSq() < 1e-8) {
      const frame = orientedFrame(normal)
      right = frame.right
      up = frame.up
    } else {
      up = up.normalize()
      right = up.clone().cross(normal).normalize()
      up = normal.clone().cross(right).normalize()
    }
    const angles: number[] = []
    const us: number[] = []
    const vs: number[] = []
    const axial: number[] = []
    let mean = 0
    for (const index of loop) {
      const offset = this.position(index).sub(center)
      const along = offset.dot(normal)
      const flat = offset.addScaledVector(normal, -along)
      const radius = flat.length()
      if (radius < 1e-6) throw new Error('Skin branch opening collapsed')
      const across = flat.dot(right)
      const upward = flat.dot(up)
      angles.push(Math.atan2(upward, across))
      us.push(across)
      vs.push(upward)
      axial.push(along)
      mean += radius
    }
    mean /= loop.length
    for (let i = 1; i < angles.length; i++) {
      while (angles[i]! - angles[i - 1]! > Math.PI) angles[i] = angles[i]! - Math.PI * 2
      while (angles[i]! - angles[i - 1]! < -Math.PI) angles[i] = angles[i]! + Math.PI * 2
    }
    const steps: number[] = []
    for (let i = 1; i < angles.length; i++) steps.push(angles[i]! - angles[i - 1]!)
    let closing = angles[0]! - angles[angles.length - 1]!
    while (closing > Math.PI) closing -= Math.PI * 2
    while (closing < -Math.PI) closing += Math.PI * 2
    steps.push(closing)
    const turn = steps.reduce((total, step) => total + step, 0)
    if (Math.abs(Math.abs(turn) - Math.PI * 2) > 0.35) throw new Error('Skin branch opening is not star shaped')
    const sign = Math.sign(turn)
    for (const step of steps) if (step * sign < 1e-4) throw new Error('Skin branch opening is not star shaped')
    return { right, up, us, vs, axial, mean, sign }
  }
  private aimUp(tangent: Vector3, seed: Vector3, right: Vector3, up: Vector3): { right: Vector3, up: Vector3 } {
    const flat = seed.clone().addScaledVector(tangent, -seed.dot(tangent))
    if (flat.lengthSq() < 1e-8) return { right, up }
    const aimedUp = flat.normalize()
    const aimedRight = aimedUp.clone().cross(tangent).normalize()
    return { right: aimedRight, up: tangent.clone().cross(aimedRight).normalize() }
  }
  private transportFrame(tangent0: Vector3, right0: Vector3, up0: Vector3, tangent1: Vector3): { right: Vector3, up: Vector3 } {
    const from = tangent0.clone().normalize()
    const to = tangent1.clone().normalize()
    const cross = from.clone().cross(to)
    const sin = cross.length()
    const cos = Math.min(1, Math.max(-1, from.dot(to)))
    const rotate = (vector: Vector3) => {
      if (sin < 1e-6) return cos > 0 ? vector.clone() : vector.clone().applyAxisAngle(right0.clone().normalize(), Math.PI)
      return vector.clone().applyAxisAngle(cross.clone().multiplyScalar(1 / sin), Math.atan2(sin, cos))
    }
    const spunRight = rotate(right0)
    spunRight.addScaledVector(to, -spunRight.dot(to))
    const spunUp = rotate(up0)
    if (spunRight.lengthSq() < 1e-8) {
      const frame = orientedFrame(to)
      return { right: frame.right, up: frame.up }
    }
    const right = spunRight.normalize()
    const up = to.clone().cross(right)
    if (up.dot(spunUp) < 0) right.negate()
    return { right, up: to.clone().cross(right).normalize() }
  }
  private influences(weights: SkinWeight[]): { joints: number[], values: number[] } {
    const used = weights.filter(pair => pair[1] > 0).slice(0, 4)
    const sum = used.reduce((total, pair) => total + pair[1], 0) || 1
    const joints = [0, 0, 0, 0]
    const values = [0, 0, 0, 0]
    used.forEach((pair, index) => { joints[index] = pair[0]; values[index] = pair[1] / sum })
    return { joints, values }
  }
  private hole(a: number[], b: number[], start: number, count: number): number[] {
    const span = a.length
    const loop: number[] = []
    for (let i = 0; i <= count; i++) loop.push(a[(start + i) % span]!)
    for (let i = 0; i <= count; i++) loop.push(b[(start + count - i) % span]!)
    return loop
  }
  private patchFlip(a: number[], b: number[], inside: Vector3, blocked?: Set<number>): boolean {
    let score = 0
    for (let segment = 0; segment < a.length; segment++) {
      if (blocked?.has(segment)) continue
      const span = a.length
      const a0 = a[segment]!, a1 = a[(segment + 1) % span]!, b0 = b[segment]!, b1 = b[(segment + 1) % span]!
      score += this.faceScore(a0, a1, b0, inside) + this.faceScore(a1, b1, b0, inside)
    }
    return score < 0
  }
  private faceScore(i0: number, i1: number, i2: number, inside: Vector3): number {
    const a = this.position(i0), b = this.position(i1), c = this.position(i2)
    const cross = b.clone().sub(a).cross(c.clone().sub(a))
    const mid = a.clone().add(b).add(c).multiplyScalar(1 / 3)
    return cross.dot(mid.sub(inside))
  }
  private quad(a: number[], b: number[], segment: number, flip: boolean): void {
    const span = a.length
    const a0 = a[segment]!, a1 = a[(segment + 1) % span]!, b0 = b[segment]!, b1 = b[(segment + 1) % span]!
    this.face(a0, a1, b0, flip)
    this.face(a1, b1, b0, flip)
  }
  private face(i0: number, i1: number, i2: number, flip: boolean): void {
    const a = this.position(i0), b = this.position(i1), c = this.position(i2)
    const cross = b.clone().sub(a).cross(c.clone().sub(a))
    if (cross.lengthSq() < 1e-18) throw new Error('Skin triangle collapsed')
    if (flip) this.indices.push(i0, i2, i1)
    else this.indices.push(i0, i1, i2)
  }
}
