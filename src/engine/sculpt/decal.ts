import { Vector3 } from 'three';
import type { SculptField, SculptShape } from './field.ts';
import type { ReducedMesh } from './reduce.ts';

export interface SculptDecalRing {
  shape: SculptShape;
  radius: number;
  offset?: [number, number];
}

export interface SculptDecal {
  label: string;
  center: Vector3;
  axis: Vector3;
  right: Vector3;
  up: Vector3;
  stretch: number;
  segments: number;
  pad: number;
  rings: SculptDecalRing[];
}

export const decalDepth = (decal: SculptDecal) => decal.rings[0]!.radius * Math.max(1, decal.stretch) * 3;

export function decalOutline(decal: SculptDecal, x: number, y: number, z: number): boolean {
  const dx = x - decal.center.x, dy = y - decal.center.y, dz = z - decal.center.z, radius = decal.rings[0]!.radius;
  if (Math.abs(dx * decal.axis.x + dy * decal.axis.y + dz * decal.axis.z) > decalDepth(decal) + decal.pad) return false;
  const u = (dx * decal.right.x + dy * decal.right.y + dz * decal.right.z) / (radius * decal.stretch + decal.pad);
  const v = (dx * decal.up.x + dy * decal.up.y + dz * decal.up.z) / (radius + decal.pad);
  return u * u + v * v < 1;
}

export function decalInside(decal: SculptDecal, x: number, y: number, z: number, radius: number, offset?: [number, number]): boolean {
  const dx = x - decal.center.x, dy = y - decal.center.y, dz = z - decal.center.z;
  if (Math.abs(dx * decal.axis.x + dy * decal.axis.y + dz * decal.axis.z) > decalDepth(decal)) return false;
  const u = (dx * decal.right.x + dy * decal.right.y + dz * decal.right.z - (offset?.[0] ?? 0)) / decal.stretch;
  const v = dx * decal.up.x + dy * decal.up.y + dz * decal.up.z - (offset?.[1] ?? 0);
  return u * u + v * v < radius * radius;
}

export function decalRingAt(decal: SculptDecal, x: number, y: number, z: number): SculptDecalRing | null {
  for (let i = decal.rings.length - 1; i >= 0; i--) if (decalInside(decal, x, y, z, decal.rings[i]!.radius, decal.rings[i]!.offset)) return decal.rings[i]!;
  return null;
}

function zipper(faces: number[], outer: number[], inner: number[], angle: (v: number) => number, innerAngle: (v: number) => number = angle): void {
  const base = angle(outer[0]!);
  const turn = (v: number) => { let a = innerAngle(v) - base; while (a < 0) a += Math.PI * 2; while (a >= Math.PI * 2) a -= Math.PI * 2; return a; };
  let start = 0;
  for (let j = 1; j < inner.length; j++) if (turn(inner[j]!) < turn(inner[start]!)) start = j;
  const M = outer.length, S = inner.length;
  const sweep = [0];
  for (let i = 1; i <= M; i++) {
    let delta = angle(outer[i % M]!) - angle(outer[i - 1]!);
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    sweep.push(sweep[i - 1]! + delta);
  }
  const total = sweep[M]!;
  for (let i = 1; i <= M; i++) sweep[i] = Math.max(sweep[i - 1]!, sweep[i]! * Math.PI * 2 / total);
  const outerAt = (i: number) => sweep[Math.min(i, M)]!;
  const innerAt = (j: number) => j >= S ? Math.PI * 2 + turn(inner[start]!) : turn(inner[(start + j) % S]!);
  let i = 0, j = 0;
  while (i < M || j < S) {
    const L = outer[i % M]!, L1 = outer[(i + 1) % M]!, R = inner[(start + j) % S]!, R1 = inner[(start + j + 1) % S]!;
    const advanceOuter = j >= S || (i < M && outerAt(i + 1) <= innerAt(j + 1));
    if (advanceOuter) { faces.push(L, L1, R); i++; }
    else { faces.push(L, R1, R); j++; }
  }
}

export function insetDecal(mesh: ReducedMesh, field: SculptField, decal: SculptDecal, cell: number): ReducedMesh {
  const P = mesh.positions.slice(), F = mesh.faces;
  const removed = new Uint8Array(F.length / 3);
  for (let f = 0; f < F.length / 3; f++) {
    let x = 0, y = 0, z = 0;
    for (let e = 0; e < 3; e++) { const v = F[f * 3 + e]!; x += P[v * 3]!; y += P[v * 3 + 1]!; z += P[v * 3 + 2]!; }
    if (decalOutline(decal, x / 3, y / 3, z / 3)) removed[f] = 1;
  }
  const n = P.length / 3;
  const incident = new Map<number, number[]>();
  for (let f = 0; f < F.length / 3; f++) for (let e = 0; e < 3; e++) { const v = F[f * 3 + e]!; const list = incident.get(v) ?? []; list.push(f); incident.set(v, list); }
  let next = new Map<number, number>();
  for (let attempt = 0; ; attempt++) {
    const directed = new Set<number>();
    for (let f = 0; f < F.length / 3; f++) if (removed[f]) for (let e = 0; e < 3; e++) directed.add(F[f * 3 + e]! * n + F[f * 3 + (e + 1) % 3]!);
    next = new Map<number, number>();
    const pinched = new Set<number>();
    for (const code of directed) {
      const u = Math.floor(code / n), v = code % n;
      if (directed.has(v * n + u)) continue;
      if (next.has(u)) pinched.add(u);
      next.set(u, v);
    }
    if (!pinched.size) break;
    if (attempt >= 6) throw new Error('Sculpt decal ' + decal.label + ' covers a region with a pinched outline; enlarge or move it');
    for (const v of pinched) for (const f of incident.get(v)!) removed[f] = 1;
  }
  const keep: number[] = [];
  for (let f = 0; f < F.length / 3; f++) if (!removed[f]) keep.push(F[f * 3]!, F[f * 3 + 1]!, F[f * 3 + 2]!);
  if (next.size < 3) throw new Error('Sculpt decal ' + decal.label + ' does not cover any surface; move it onto the body');
  const loop: number[] = [next.keys().next().value!];
  while (loop.length <= next.size) {
    const step = next.get(loop[loop.length - 1]!)!;
    if (step === loop[0]) break;
    loop.push(step);
  }
  if (loop.length !== next.size) throw new Error('Sculpt decal ' + decal.label + ' covers a region with holes or several pieces; enlarge or move it');
  const offset = new Vector3();
  const centerOf = (ring?: SculptDecalRing) => decal.center.clone().addScaledVector(decal.right, ring?.offset?.[0] ?? 0).addScaledVector(decal.up, ring?.offset?.[1] ?? 0);
  const angleAbout = (center: Vector3) => (v: number) => {
    offset.set(P[v * 3]! - center.x, P[v * 3 + 1]! - center.y, P[v * 3 + 2]! - center.z);
    return Math.atan2(offset.dot(decal.up), offset.dot(decal.right) / decal.stretch);
  };
  const angle = angleAbout(decal.center);
  let winding = 0;
  for (let i = 0; i < loop.length; i++) {
    let delta = angle(loop[(i + 1) % loop.length]!) - angle(loop[i]!);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    winding += delta;
  }
  const sign = winding >= 0 ? 1 : -1;
  const signedAbout = (center: Vector3) => { const raw = angleAbout(center); return (v: number) => sign * raw(v); };
  const point = new Vector3();
  const place = (ring: SculptDecalRing | undefined, radius: number, theta: number) => {
    const middle = centerOf(ring);
    point.copy(middle).addScaledVector(decal.right, Math.cos(theta) * radius * decal.stretch).addScaledVector(decal.up, Math.sin(theta) * radius);
    const reach = decalDepth(decal), along = (t: number) => field.value(point.x + decal.axis.x * t, point.y + decal.axis.y * t, point.z + decal.axis.z * t);
    if (along(-reach) < 0 && along(reach) > 0) {
      let inside = -reach, outside = reach;
      for (let i = 0; i < 40; i++) { const mid = (inside + outside) / 2; if (along(mid) < 0) inside = mid; else outside = mid; }
      point.addScaledVector(decal.axis, (inside + outside) / 2);
    } else field.project(point, cell * 0.25, radius * decal.stretch + middle.distanceTo(decal.center) + cell);
    P.push(point.x, point.y, point.z);
    return P.length / 3 - 1;
  };
  const faces = keep;
  let previous = loop, previousAngle = signedAbout(decal.center);
  for (const [index, ring] of decal.rings.entries()) {
    const segments = index === 0 ? decal.segments * 2 : decal.segments, ringAngle = signedAbout(centerOf(ring));
    const current = Array.from({ length: segments }, (_, j) => place(ring, ring.radius, sign * (j / segments) * Math.PI * 2));
    zipper(faces, previous, current, previousAngle, ringAngle);
    previous = current; previousAngle = ringAngle;
  }
  const center = place(decal.rings.at(-1), 0, 0);
  for (let j = 0; j < previous.length; j++) faces.push(previous[j]!, previous[(j + 1) % previous.length]!, center);
  return { positions: P, faces };
}

