import { Vector3 } from 'three';
import type { SculptRGB } from './field.ts';
import type { ReducedMesh } from './reduce.ts';

export interface SeamCut {
  mesh: ReducedMesh;
  colors: Map<string, SculptRGB>;
}

export const faceKey = (faces: number[], f: number) => faces[f * 3] + ',' + faces[f * 3 + 1] + ',' + faces[f * 3 + 2];

export interface SeamRegion { key: string, color: SculptRGB | null }

export function cutSeams(mesh: ReducedMesh, regionAt: (point: Vector3, normal: Vector3) => SeamRegion, steps = 12, clamp = 0.15): SeamCut {
  const P = mesh.positions.slice(), F = mesh.faces, n = P.length / 3;
  const normals = new Float64Array(n * 3);
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (let f = 0; f < F.length / 3; f++) {
    a.fromArray(P, F[f * 3]! * 3); b.fromArray(P, F[f * 3 + 1]! * 3); c.fromArray(P, F[f * 3 + 2]! * 3);
    const area = b.sub(a).cross(c.sub(a));
    for (let e = 0; e < 3; e++) { const v = F[f * 3 + e]!; normals[v * 3] = normals[v * 3]! + area.x; normals[v * 3 + 1] = normals[v * 3 + 1]! + area.y; normals[v * 3 + 2] = normals[v * 3 + 2]! + area.z; }
  }
  const point = (v: number) => new Vector3(P[v * 3]!, P[v * 3 + 1]!, P[v * 3 + 2]!);
  const normal = (v: number) => new Vector3(normals[v * 3]!, normals[v * 3 + 1]!, normals[v * 3 + 2]!).normalize();
  const palette = new Map<string, SculptRGB | null>();
  const label = (p: Vector3, nrm: Vector3) => { const region = regionAt(p, nrm); if (!palette.has(region.key)) palette.set(region.key, region.color); return region.key; };
  const labels = Array.from({ length: n }, (_, v) => label(point(v), normal(v)));
  const splits = new Map<string, number>();
  const split = (u: number, v: number) => {
    const id = u < v ? u + '_' + v : v + '_' + u;
    const known = splits.get(id);
    if (known !== undefined) return known;
    const lo = u < v ? u : v, hi = u < v ? v : u, pl = point(lo), ph = point(hi), nl = normal(lo), nh = normal(hi), start = labels[lo]!;
    let t0 = 0, t1 = 1;
    for (let i = 0; i < steps; i++) {
      const t = (t0 + t1) / 2;
      if (label(pl.clone().lerp(ph, t), nl.clone().lerp(nh, t).normalize()) === start) t0 = t; else t1 = t;
    }
    const t = Math.min(1 - clamp, Math.max(clamp, (t0 + t1) / 2)), at = pl.lerp(ph, t);
    P.push(at.x, at.y, at.z);
    splits.set(id, P.length / 3 - 1);
    return P.length / 3 - 1;
  };
  const faces: number[] = [], colors = new Map<string, SculptRGB>();
  const emit = (x: number, y: number, z: number, k: string) => { faces.push(x, y, z); const color = palette.get(k); if (color) colors.set(x + ',' + y + ',' + z, color); };
  for (let f = 0; f < F.length / 3; f++) {
    let [i, j, k] = [F[f * 3]!, F[f * 3 + 1]!, F[f * 3 + 2]!];
    const li = labels[i]!, lj = labels[j]!, lk = labels[k]!;
    if (li === lj && lj === lk) { emit(i, j, k, li); continue; }
    if (li !== lj && lj !== lk && li !== lk) {
      const m = P.length / 3;
      P.push((P[i * 3]! + P[j * 3]! + P[k * 3]!) / 3, (P[i * 3 + 1]! + P[j * 3 + 1]! + P[k * 3 + 1]!) / 3, (P[i * 3 + 2]! + P[j * 3 + 2]! + P[k * 3 + 2]!) / 3);
      const ij = split(i, j), jk = split(j, k), ki = split(k, i);
      emit(i, ij, m, li); emit(i, m, ki, li); emit(j, jk, m, lj); emit(j, m, ij, lj); emit(k, ki, m, lk); emit(k, m, jk, lk);
      continue;
    }
    if (lj === lk) [i, j, k] = [j, k, i]; else if (li === lk) [i, j, k] = [k, i, j];
    const ik = split(i, k), jk = split(j, k);
    emit(i, j, jk, labels[i]!); emit(i, jk, ik, labels[i]!); emit(ik, jk, k, labels[k]!);
  }
  return { mesh: { positions: P, faces }, colors };
}
