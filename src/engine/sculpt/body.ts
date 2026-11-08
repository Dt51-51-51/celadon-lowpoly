import { BufferAttribute, BufferGeometry, Vector3 } from 'three';
import { coneShape, ellipsoidShape, frameOf, SculptField, type SculptNode, type SculptPaint, type SculptRGB, type SculptShape } from './field.ts';
import { marchTetrahedra, type NetMesh } from './nets.ts';
import { reduceMesh, type ReducedMesh } from './reduce.ts';
import { remeshSurface } from './remesh.ts';
import { decalOutline, decalRingAt, insetDecal, type SculptDecal } from './decal.ts';
import { inspectTopology, faceShells, type TopologyReport } from './topology.ts';
import { cutSeams, faceKey } from './seams.ts';

export type { SculptPaint, SculptRGB } from './field.ts';

export interface SculptLook {
  bone?: number;
  paint?: SculptPaint;
  detail?: number;
}

export interface SculptOrient {
  forward?: Vector3;
  up?: Vector3;
  taper?: number;
}

export interface SculptPartOptions extends SculptLook {
  blend?: number;
  join?: number;
}

export interface SculptBuildOptions {
  triangles: number;
  cell: number;
  floor?: number;
  jitter?: number;
  borderWeight?: number;
  lengthWeight?: number;
  relax?: number;
  seams?: boolean;
}

interface ShapeHome { part: SculptPart, reach: number }

export class SculptPart implements SculptNode {
  readonly shapes: SculptShape[] = [];
  readonly carves: { shape: SculptShape, blend: number }[] = [];
  readonly children: SculptPart[] = [];
  constructor(private readonly body: SculptBody, readonly name: string, readonly blend: number, readonly join: number, private readonly look: Required<SculptLook>) {
    if (!(blend >= 0) || !(join >= 0)) throw new Error('Sculpt part ' + name + ' needs non-negative blend and join');
  }
  ellipsoid(label: string, center: Vector3, radii: [number, number, number], options: SculptLook & SculptOrient = {}): this {
    const look = this.resolve(options);
    this.add(ellipsoidShape(this.body.nextId(), this.name + '.' + label, center, radii, frameOf(options.forward, options.up), options.taper ?? 0, look.bone, look.paint, look.detail));
    return this;
  }
  limb(label: string, points: Vector3[], radii: number[], options: SculptLook & { bones?: number[] } = {}): this {
    if (points.length < 2 || radii.length !== points.length) throw new Error('Sculpt limb ' + label + ' needs matching points and radii');
    if (options.bones && options.bones.length !== points.length - 1) throw new Error('Sculpt limb ' + label + ' needs one bone per segment');
    const look = this.resolve(options);
    for (let i = 0; i < points.length - 1; i++) {
      this.add(coneShape(this.body.nextId(), this.name + '.' + label + '[' + i + ']', points[i]!, points[i + 1]!, radii[i]!, radii[i + 1]!, options.bones?.[i] ?? look.bone, look.paint, look.detail));
    }
    return this;
  }
  carve(label: string, center: Vector3, radii: [number, number, number], options: SculptLook & SculptOrient & { blend?: number } = {}): this {
    const look = this.resolve(options);
    const shape = ellipsoidShape(this.body.nextId(), this.name + '.' + label, center, radii, frameOf(options.forward, options.up), options.taper ?? 0, look.bone, look.paint, look.detail);
    this.carves.push({ shape, blend: options.blend ?? this.blend * 0.5 });
    this.body.register(shape, { part: this, reach: Math.max(this.blend, this.join) });
    return this;
  }
  paint(label: string, center: Vector3, radii: [number, number, number], options: SculptLook & SculptOrient = {}): this {
    const look = this.resolve(options);
    this.body.overlays.push(ellipsoidShape(this.body.nextId(), this.name + '.' + label, center, radii, frameOf(options.forward, options.up), options.taper ?? 0, look.bone, look.paint, look.detail));
    return this;
  }
  decal(label: string, center: Vector3, axis: Vector3, rings: { radius: number, paint: SculptPaint, offset?: [number, number] }[], options: { up?: Vector3, stretch?: number, segments?: number, detail?: number } = {}): this {
    if (!rings.length || rings.some((ring, index) => !(ring.radius > 0) || (index > 0 && ring.radius >= rings[index - 1]!.radius))) throw new Error('Sculpt decal ' + label + ' needs rings with shrinking positive radii');
    const frame = frameOf(axis, options.up);
    const stretch = options.stretch ?? 1, detail = options.detail ?? Math.max(this.look.detail, 3);
    const shapes = rings.map((ring, index) => {
      const middle = center.clone().addScaledVector(frame.right, ring.offset?.[0] ?? 0).addScaledVector(frame.up, ring.offset?.[1] ?? 0);
      const shape = ellipsoidShape(this.body.nextId(), this.name + '.' + label + '[' + index + ']', middle, [ring.radius * stretch, ring.radius, rings[0]!.radius * 3], frame, 0, this.look.bone, ring.paint, detail);
      this.body.overlays.push(shape);
      return { shape, radius: ring.radius, ...(ring.offset ? { offset: ring.offset } : {}) };
    });
        this.body.decals.push({ label: this.name + '.' + label, center: center.clone(), axis: frame.forward, right: frame.right, up: frame.up, stretch, segments: options.segments ?? 12, pad: rings[0]!.radius * 0.2, rings: shapes });
    return this;
  }
  attach(name: string, options: SculptPartOptions = {}): SculptPart {
    const look = this.resolve(options);
    const child = new SculptPart(this.body, name, options.blend ?? this.blend * 0.5, options.join ?? this.blend * 0.5, look);
    this.children.push(child);
    return child;
  }
  surface(from: Vector3, direction: Vector3, limit = 1): Vector3 {
    const field = new SculptField(this, [], null);
    const dir = direction.clone().normalize();
    const at = (t: number) => field.value(from.x + dir.x * t, from.y + dir.y * t, from.z + dir.z * t);
    if (at(0) >= 0) throw new Error('Sculpt part ' + this.name + ' does not contain the surface search start');
    let inside = 0, t = 0;
    for (let step = 0; step < 400 && t <= limit; step++) {
      const d = at(t);
      if (d >= 0) break;
      inside = t;
      t += Math.max(-d * 0.9, limit * 1e-4);
    }
    if (t > limit) throw new Error('Sculpt part ' + this.name + ' has no surface within ' + limit + ' along the search');
    let outside = t;
    for (let i = 0; i < 40; i++) {
      const mid = (inside + outside) / 2;
      if (at(mid) < 0) inside = mid; else outside = mid;
    }
    return from.clone().addScaledVector(dir, (inside + outside) / 2);
  }
  private resolve(options: SculptLook): Required<SculptLook> {
    return { bone: options.bone ?? this.look.bone, paint: options.paint ?? this.look.paint, detail: options.detail ?? this.look.detail };
  }
  private add(shape: SculptShape): void {
    this.shapes.push(shape);
    this.body.register(shape, { part: this, reach: Math.max(this.blend, this.join) });
  }
}

export class SculptResult {
  constructor(
    private readonly positions: number[],
    private readonly faces: number[],
    private readonly colors: SculptRGB[],
    private readonly joints: Uint16Array,
    private readonly weights: Float32Array,
    readonly topology: TopologyReport,
    readonly cell: number,
  ) {}
  get triangles(): number { return this.faces.length / 3; }
  minY(): number {
    let low = Infinity;
    for (let i = 1; i < this.positions.length; i += 3) low = Math.min(low, this.positions[i]!);
    return low;
  }
  shiftY(offset: number): void {
    for (let i = 1; i < this.positions.length; i += 3) this.positions[i] = this.positions[i]! + offset;
  }
  separation(boneA: number, boneB: number, threshold = 0.45): number {
    const pick = (bone: number) => {
      const out: number[] = [];
      for (let v = 0; v < this.positions.length / 3; v++) for (let k = 0; k < 4; k++) if (this.joints[v * 4 + k] === bone && this.weights[v * 4 + k]! >= threshold) out.push(v);
      return out;
    };
    const a = pick(boneA), b = pick(boneB);
    if (!a.length || !b.length) throw new Error('Sculpt bones ' + boneA + ' and ' + boneB + ' own no surface');
    let best = Infinity;
    for (const p of a) for (const q of b) best = Math.min(best, (this.positions[p * 3]! - this.positions[q * 3]!) ** 2 + (this.positions[p * 3 + 1]! - this.positions[q * 3 + 1]!) ** 2 + (this.positions[p * 3 + 2]! - this.positions[q * 3 + 2]!) ** 2);
    return Math.sqrt(best);
  }
  geometry(): BufferGeometry {
    const count = this.faces.length;
    const position = new Float32Array(count * 3), color = new Float32Array(count * 3), skinIndex = new Uint16Array(count * 4), skinWeight = new Float32Array(count * 4);
    const index = new Uint32Array(count);
    for (let corner = 0; corner < count; corner++) {
      const v = this.faces[corner]!, paint = this.colors[Math.floor(corner / 3)]!;
      for (let k = 0; k < 3; k++) { position[corner * 3 + k] = this.positions[v * 3 + k]!; color[corner * 3 + k] = paint[k]!; }
      for (let k = 0; k < 4; k++) { skinIndex[corner * 4 + k] = this.joints[v * 4 + k]!; skinWeight[corner * 4 + k] = this.weights[v * 4 + k]!; }
      index[corner] = corner;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(position, 3));
    geometry.setAttribute('color', new BufferAttribute(color, 3));
    geometry.setAttribute('skinIndex', new BufferAttribute(skinIndex, 4));
    geometry.setAttribute('skinWeight', new BufferAttribute(skinWeight, 4));
    geometry.setIndex(new BufferAttribute(index, 1));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

function colorKey(color: SculptRGB): string {
  return color.map(value => Math.round(value * 255)).join(',');
}

function hash3(x: number, y: number, z: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

export class SculptBody {
  readonly root: SculptPart;
  private count = 0;
  private readonly homes = new Map<SculptShape, ShapeHome>();
  readonly overlays: SculptShape[] = [];
  readonly decals: SculptDecal[] = [];
  constructor(options: Required<SculptLook> & { blend: number }) {
    this.root = new SculptPart(this, 'body', options.blend, 0, { bone: options.bone, paint: options.paint, detail: options.detail });
  }
  nextId(): number { return this.count++; }
  register(shape: SculptShape, home: ShapeHome): void { this.homes.set(shape, home); }
  build(options: SculptBuildOptions): SculptResult {
    if (!(options.triangles >= 4)) throw new Error('Sculpt triangle budget is too small');
    const all = [...this.homes.keys()];
    const solids = all.filter(shape => this.homes.get(shape)!.part.shapes.includes(shape));
    const field = new SculptField(this.root, all, options.floor ?? null, this.overlays);
    let reach = 0;
    for (const home of this.homes.values()) reach = Math.max(reach, home.part.blend + home.part.join);
    const cell = options.cell;
    field.accelerate(cell * 4, shape => {
      const part = this.homes.get(shape)!.part;
      const childJoin = part.children.reduce((most, child) => Math.max(most, child.join), 0);
      return Math.max(part.blend, part.join, childJoin, ...part.carves.map(carve => carve.blend)) + cell * 2;
    });
    const dense = this.oneShell(marchTetrahedra(field, cell, reach), field, cell);
    const report = inspectTopology(dense.faces, dense.positions.length / 3);
    if (report.boundaryEdges || report.nonManifoldEdges || report.pinchedVertices || report.windingErrors) {
      const places = new Map<string, string>();
      for (const v of report.problems) {
        const x = dense.positions[v * 3]!, y = dense.positions[v * 3 + 1]!, z = dense.positions[v * 3 + 2]!;
        const label = field.ownerAt(x, y, z).label;
        if (!places.has(label)) places.set(label, [x, y, z].map(value => value.toFixed(3)).join(','));
      }
      throw new Error('Sculpt surface is broken near ' + [...places].map(([label, at]) => label + ' (' + at + ')').join(', ') + ': ' + JSON.stringify({ ...report, problems: undefined }));
    }
    const centroid = new Vector3(), normal = new Vector3();
    const decalRingShapes = new Set(this.decals.flatMap(decal => decal.rings.map(ring => ring.shape)));
    const faceColor = (mesh: ReducedMesh, f: number): SculptRGB => {
      const [a, b, c] = [mesh.faces[f * 3]!, mesh.faces[f * 3 + 1]!, mesh.faces[f * 3 + 2]!];
      const p = (v: number) => new Vector3(mesh.positions[v * 3]!, mesh.positions[v * 3 + 1]!, mesh.positions[v * 3 + 2]!);
      const pa = p(a), pb = p(b), pc = p(c);
      centroid.copy(pa).add(pb).add(pc).multiplyScalar(1 / 3);
      normal.copy(pb).sub(pa).cross(pc.clone().sub(pa)).normalize();
      for (const decal of this.decals) {
        const ring = decalRingAt(decal, centroid.x, centroid.y, centroid.z);
        if (ring) return typeof ring.shape.paint === 'function' ? ring.shape.paint(centroid.clone(), normal.clone()) : ring.shape.paint;
      }
      const owner = field.ownerAt(centroid.x, centroid.y, centroid.z, decalRingShapes);
      return typeof owner.paint === 'function' ? owner.paint(centroid.clone(), normal.clone()) : owner.paint;
    };
    const byId = new Map(all.map(shape => [shape.id, shape]));
    const vertexOwners = dense.owners.map((id, v) => {
      const x = dense.positions[v * 3]!, y = dense.positions[v * 3 + 1]!, z = dense.positions[v * 3 + 2]!;
      let owner = byId.get(id);
      for (const overlay of this.overlays) if (overlay.distance(x, y, z) < 0) owner = overlay;
      return owner ?? field.ownerAt(x, y, z);
    });
    const keys = new Map<string, number>();
    const denseRegions = Int32Array.from({ length: dense.faces.length / 3 }, (_, f) => {
      const a = dense.faces[f * 3]!, b = dense.faces[f * 3 + 1]!, c = dense.faces[f * 3 + 2]!;
      const owner = vertexOwners[a]!;
      let paint = owner.paint;
      if (typeof paint === 'function') {
        const P = dense.positions;
        centroid.set((P[a * 3]! + P[b * 3]! + P[c * 3]!) / 3, (P[a * 3 + 1]! + P[b * 3 + 1]! + P[c * 3 + 1]!) / 3, (P[a * 3 + 2]! + P[b * 3 + 2]! + P[c * 3 + 2]!) / 3);
        normal.set(P[b * 3]! - P[a * 3]!, P[b * 3 + 1]! - P[a * 3 + 1]!, P[b * 3 + 2]! - P[a * 3 + 2]!).cross(new Vector3(P[c * 3]! - P[a * 3]!, P[c * 3 + 1]! - P[a * 3 + 1]!, P[c * 3 + 2]! - P[a * 3 + 2]!)).normalize();
        paint = paint(centroid, normal);
      }
      const key = colorKey(paint);
      if (!keys.has(key)) keys.set(key, keys.size);
      return keys.get(key)!;
    });
    const importance = Float64Array.from(vertexOwners, owner => owner.detail);
    let mesh = reduceMesh(dense, { target: Math.round(options.triangles * 2.5), importance, region: denseRegions, borderWeight: options.borderWeight ?? 2, lengthWeight: options.lengthWeight ?? 0.002 });
    mesh = remeshSurface(mesh, field, cell, options.triangles, options.relax ?? 8);
    let painted: Map<string, SculptRGB> | null = null;
    if (options.seams !== false) {
      let edgeSum = 0;
      for (let f = 0; f < mesh.faces.length / 3; f++) for (let e = 0; e < 3; e++) {
        const u = mesh.faces[f * 3 + e]!, v = mesh.faces[f * 3 + (e + 1) % 3]!;
        edgeSum += Math.hypot(mesh.positions[u * 3]! - mesh.positions[v * 3]!, mesh.positions[u * 3 + 1]! - mesh.positions[v * 3 + 1]!, mesh.positions[u * 3 + 2]! - mesh.positions[v * 3 + 2]!);
      }
      const edge = edgeSum / mesh.faces.length;
      for (const decal of this.decals) decal.pad = Math.max(decal.rings[0]!.radius * 0.2, edge * 0.9);
      const decalShapes = new Set(this.decals.flatMap(decal => decal.rings.map(ring => ring.shape)));
      const cut = cutSeams(mesh, (point, normal) => {
        for (const [index, decal] of this.decals.entries()) if (decalOutline(decal, point.x, point.y, point.z)) return { key: 'decal:' + index, color: null };
        const owner = field.ownerAt(point.x, point.y, point.z, decalShapes), color = typeof owner.paint === 'function' ? owner.paint(point.clone(), normal.clone()) : owner.paint;
        return { key: colorKey(color), color };
      });
      mesh = cut.mesh; painted = cut.colors;
    }
    for (const decal of this.decals) mesh = insetDecal(mesh, field, decal, cell);
    const topology = inspectTopology(mesh.faces, mesh.positions.length / 3);
    if (topology.shells !== 1 || topology.boundaryEdges || topology.nonManifoldEdges || topology.windingErrors || topology.pinchedVertices) throw new Error('Sculpt reduction broke the surface: ' + JSON.stringify(topology));
    for (let f = 0; f < mesh.faces.length / 3; f++) {
      const p = (k: number) => new Vector3().fromArray(mesh.positions, mesh.faces[f * 3 + k]! * 3);
      const a = p(0);
      if (p(1).sub(a).cross(p(2).sub(a)).lengthSq() < 1e-16) throw new Error('Sculpt surface kept a degenerate triangle near ' + a.toArray().map(value => value.toFixed(3)).join(','));
    }
    const jitter = options.jitter ?? 0;
    const colors = Array.from({ length: mesh.faces.length / 3 }, (_, f) => {
      const base = painted?.get(faceKey(mesh.faces, f)) ?? faceColor(mesh, f);
      if (!jitter) return base;
      for (let k = 0; k < 3; k++) centroid.setComponent(k, (mesh.positions[mesh.faces[f * 3]! * 3 + k]! + mesh.positions[mesh.faces[f * 3 + 1]! * 3 + k]! + mesh.positions[mesh.faces[f * 3 + 2]! * 3 + k]!) / 3);
      const shade = 1 + jitter * (hash3(centroid.x * 97, centroid.y * 97, centroid.z * 97) * 2 - 1);
      return base.map(value => Math.min(1, Math.max(0, value * shade))) as SculptRGB;
    });
    const { joints, weights } = this.skin(mesh, field, solids, cell);
    return new SculptResult(mesh.positions, mesh.faces, colors, joints, weights, topology, cell);
  }
  private oneShell(mesh: NetMesh, field: SculptField, cell: number): NetMesh {
    const shell = faceShells(mesh.faces, mesh.positions.length / 3);
    const sizes = new Map<number, number>();
    const low = new Map<number, number[]>(), high = new Map<number, number[]>();
    for (let f = 0; f < shell.length; f++) {
      const id = shell[f]!;
      sizes.set(id, (sizes.get(id) ?? 0) + 1);
      const box = low.get(id) ?? [Infinity, Infinity, Infinity], top = high.get(id) ?? [-Infinity, -Infinity, -Infinity];
      for (let e = 0; e < 3; e++) {
        const v = mesh.faces[f * 3 + e]!;
        for (let k = 0; k < 3; k++) { box[k] = Math.min(box[k]!, mesh.positions[v * 3 + k]!); top[k] = Math.max(top[k]!, mesh.positions[v * 3 + k]!); }
      }
      low.set(id, box); high.set(id, top);
    }
    if (sizes.size <= 1) return mesh;
    const main = [...sizes.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const crumb = (id: number) => Math.hypot(...high.get(id)!.map((value, k) => value - low.get(id)![k]!)) < cell * 4;
    const loose = new Set<string>();
    for (let f = 0; f < shell.length; f++) {
      if (shell[f] === main || crumb(shell[f]!)) continue;
      const v = mesh.faces[f * 3]!;
      loose.add(field.ownerAt(mesh.positions[v * 3]!, mesh.positions[v * 3 + 1]!, mesh.positions[v * 3 + 2]!).label);
    }
    if (loose.size) throw new Error('Sculpt shapes float free of the body: ' + [...loose].join(', ') + '. Move them closer or raise their join.');
    const faces: number[] = [];
    for (let f = 0; f < shell.length; f++) if (shell[f] === main) faces.push(mesh.faces[f * 3]!, mesh.faces[f * 3 + 1]!, mesh.faces[f * 3 + 2]!);
    return { positions: mesh.positions, faces, owners: mesh.owners, cell: mesh.cell };
  }
  private skin(mesh: ReducedMesh, field: SculptField, solids: SculptShape[], cell: number): { joints: Uint16Array, weights: Float32Array } {
    const n = mesh.positions.length / 3;
    const joints = new Uint16Array(n * 4), weights = new Float32Array(n * 4);
    const distances = new Float64Array(solids.length);
    for (let v = 0; v < n; v++) {
      const x = mesh.positions[v * 3]!, y = mesh.positions[v * 3 + 1]!, z = mesh.positions[v * 3 + 2]!;
      let nearest = 0;
      for (let i = 0; i < solids.length; i++) {
        distances[i] = solids[i]!.distance(x, y, z);
        if (distances[i]! < distances[nearest]!) nearest = i;
      }
      const nearReach = this.homes.get(solids[nearest]!)!.reach;
      const byBone = new Map<number, number>();
      for (let i = 0; i < solids.length; i++) {
        const spread = Math.max(cell * 2, nearReach, this.homes.get(solids[i]!)!.reach);
        const t = 1 - (distances[i]! - distances[nearest]!) / spread;
        if (t <= 0) continue;
        const bone = solids[i]!.bone;
        byBone.set(bone, Math.max(byBone.get(bone) ?? 0, t * t));
      }
      const ranked = [...byBone.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
      const total = ranked.reduce((sum, [, w]) => sum + w, 0);
      ranked.forEach(([bone, w], k) => { joints[v * 4 + k] = bone; weights[v * 4 + k] = w / total; });
    }
    return { joints, weights };
  }
}



