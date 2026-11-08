import { Vector3 } from 'three';
import { clippedStoneFaces, type StoneCut } from '../convex-stone.ts';
import { facetedLoft, type FacetedStation } from '../geometry.ts';

export interface FacetStoneSpec {
  width: number;
  height: number;
  depth: number;
  moss: number;
  yaw?: number;
  lean?: number;
}

export interface FacetPart {
  role: 'stone' | 'moss';
  positions: number[];
}

export interface FacetStoneBuild {
  parts: FacetPart[];
  top: [number, number, number];
  triangles: number;
}

function clean(face: Vector3[]): Vector3[] {
  const out: Vector3[] = [];
  for (const point of face) if (!out.length || out[out.length - 1]!.distanceToSquared(point) > 1e-10) out.push(point);
  if (out.length > 2 && out[0]!.distanceToSquared(out[out.length - 1]!) <= 1e-10) out.pop();
  return out;
}

function polygonNormal(face: Vector3[]): Vector3 {
  const normal = new Vector3();
  for (let i = 0; i < face.length; i++) {
    const a = face[i]!, b = face[(i + 1) % face.length]!;
    normal.x += (a.y - b.y) * (a.z + b.z);
    normal.y += (a.z - b.z) * (a.x + b.x);
    normal.z += (a.x - b.x) * (a.y + b.y);
  }
  return normal;
}

function appendFace(face: Vector3[], out: number[]): void {
  const normal = polygonNormal(face);
  if (normal.lengthSq() < 1e-16) return;
  const center = face.reduce((sum, point) => sum.add(point), new Vector3()).multiplyScalar(1 / face.length);
  for (let i = 0; i < face.length; i++) {
    const a = face[i]!, b = face[(i + 1) % face.length]!;
    const winding = a.clone().sub(center).cross(b.clone().sub(center));
    const order = winding.dot(normal) >= 0 ? [center, a, b] : [center, b, a];
    for (const point of order) out.push(point.x, point.y, point.z);
  }
}

function signedVolume(positions: number[]): number {
  let volume = 0;
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i]!, ay = positions[i + 1]!, az = positions[i + 2]!;
    const bx = positions[i + 3]!, by = positions[i + 4]!, bz = positions[i + 5]!;
    const cx = positions[i + 6]!, cy = positions[i + 7]!, cz = positions[i + 8]!;
    volume += ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
  }
  return volume / 6;
}

function flip(positions: number[]): void {
  for (let i = 0; i < positions.length; i += 9) {
    const x = positions[i + 3]!, y = positions[i + 4]!, z = positions[i + 5]!;
    positions[i + 3] = positions[i + 6]!;
    positions[i + 4] = positions[i + 7]!;
    positions[i + 5] = positions[i + 8]!;
    positions[i + 6] = x;
    positions[i + 7] = y;
    positions[i + 8] = z;
  }
}

function edgeRatio(positions: number[], index: number): number {
  const at = (k: number) => [positions[index + k]!, positions[index + k + 1]!, positions[index + k + 2]!];
  const a = at(0), b = at(3), c = at(6);
  const span = (u: number[], v: number[]) => Math.hypot(u[0]! - v[0]!, u[1]! - v[1]!, u[2]! - v[2]!);
  const ab = span(a, b), bc = span(b, c), ca = span(c, a);
  const shortest = Math.min(ab, bc, ca);
  return shortest < 1e-8 ? Infinity : Math.max(ab, bc, ca) / shortest;
}

function assertShell(parts: FacetPart[]): void {
  const counts = new Map<string, number>();
  const key = (index: number, positions: number[]) => [0, 1, 2].map(axis => Math.round(positions[index + axis]! * 1e4)).join(',');
  let triangles = 0;
  for (const part of parts) {
    for (let i = 0; i < part.positions.length; i += 9) {
      triangles++;
      const ratio = edgeRatio(part.positions, i);
      if (ratio > 96) throw new Error('Facet stone has a sliver triangle (' + ratio.toFixed(1) + ')');
      const ids = [key(i, part.positions), key(i + 3, part.positions), key(i + 6, part.positions)];
      if (new Set(ids).size < 3) throw new Error('Facet stone has a degenerate triangle');
      for (let e = 0; e < 3; e++) {
        const edge = [ids[e]!, ids[(e + 1) % 3]!].sort().join('|');
        counts.set(edge, (counts.get(edge) ?? 0) + 1);
      }
    }
  }
  let open = 0, extra = 0;
  for (const count of counts.values()) {
    if (count === 1) open++;
    else if (count !== 2) extra++;
  }
  if (!triangles || open || extra) throw new Error('Facet stone is not a closed shell (' + triangles + ' triangles, ' + open + ' open, ' + extra + ' extra)');
}


function paintFaces(faces: Vector3[][], spec: FacetStoneSpec): { stone: Vector3[][], moss: Vector3[][] } {
  if (!(spec.moss > 0)) return { stone: faces, moss: [] };
  const stone: Vector3[][] = [], moss: Vector3[][] = [];
  const yaw = spec.yaw ?? 0, dx = Math.cos(yaw), dz = Math.sin(yaw);
  const reach = Math.max(spec.width, spec.depth, 1e-6);
  for (const face of faces) {
    const normal = polygonNormal(face), span = normal.length();
    if (span < 1e-12) { stone.push(face); continue; }
    let low = Infinity, cx = 0, cz = 0;
    for (const point of face) { low = Math.min(low, point.y); cx += point.x; cz += point.z; }
    const along = (cx / face.length) / reach * dx + (cz / face.length) / reach * dz;
    const cutoff = spec.height * (0.62 - spec.moss * 0.34 - Math.max(0, along) * 0.14);
    const grown = normal.y > 0.58 * span && low >= cutoff - 1e-6;
    (grown ? moss : stone).push(face);
  }
  if (!stone.length || !moss.length) return { stone: faces, moss: [] };
  return { stone, moss };
}

function weldFaces(faces: Vector3[][], epsilon: number): Vector3[][] {
  const points: Vector3[] = [];
  const find = (point: Vector3) => {
    const hit = points.find(existing => existing.distanceToSquared(point) <= epsilon * epsilon);
    if (hit) return hit;
    points.push(point);
    return point;
  };
  return faces.map(face => clean(face.map(point => find(point)))).filter(face => face.length >= 3);
}

export function buildFacetStone(cuts: StoneCut[], spec: FacetStoneSpec): FacetStoneBuild {
  if (![spec.width, spec.height, spec.depth].every(value => value > 0 && Number.isFinite(value))) throw new Error('Facet stone needs positive dimensions');
  if (!(spec.moss >= 0) || spec.moss > 1) throw new Error('Facet stone moss coverage must be between 0 and 1');
  const raw = weldFaces(clippedStoneFaces(cuts).map(clean).filter(face => face.length >= 3), 0.012);
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const face of raw) for (const point of face) {
    minX = Math.min(minX, point.x); maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y); maxY = Math.max(maxY, point.y);
    minZ = Math.min(minZ, point.z); maxZ = Math.max(maxZ, point.z);
  }
  if (!(maxY - minY >= 0.2) || !(maxX - minX >= 0.15) || !(maxZ - minZ >= 0.15)) throw new Error('Facet stone collapsed');
  const yaw = spec.yaw ?? 0, lean = spec.lean ?? 0, cos = Math.cos(yaw), sin = Math.sin(yaw);
  const spanX = maxX - minX, spanZ = maxZ - minZ, fit = Math.min(spec.width / spanX, spec.depth / spanZ);
  const midX = (minX + maxX) / 2, midZ = (minZ + maxZ) / 2;
  const place = (point: Vector3) => {
    const x = (point.x - midX) * fit;
    const y = (point.y - minY) / (maxY - minY) * spec.height;
    const z = (point.z - midZ) * fit;
    return new Vector3(x * cos - z * sin + lean * y, y, x * sin + z * cos);
  };
  const painted = paintFaces(raw.map(face => face.map(place)), spec);
  const stone: number[] = [], moss: number[] = [];
  for (const face of painted.stone) appendFace(face, stone);
  for (const face of painted.moss) appendFace(face, moss);
  const parts = [{ role: 'stone' as const, positions: stone }, { role: 'moss' as const, positions: moss }].filter(part => part.positions.length >= 9);
  const volume = signedVolume(parts.flatMap(part => part.positions));
  if (volume < 0) for (const part of parts) flip(part.positions);
  if (!(Math.abs(volume) > 0)) throw new Error('Facet stone has no volume');
  assertShell(parts);
  let topY = -Infinity;
  const top: [number, number, number] = [0, 0, 0];
  for (const part of parts) for (let i = 0; i < part.positions.length; i += 3) if (part.positions[i + 1]! > topY) {
    topY = part.positions[i + 1]!;
    top[0] = part.positions[i]!; top[1] = topY; top[2] = part.positions[i + 2]!;
  }
  if (Math.abs(topY - spec.height) > 1e-3) throw new Error('Facet stone height drifted to ' + topY);
  return { parts, top, triangles: parts.reduce((sum, part) => sum + part.positions.length / 9, 0) };
}

export function buildLoftStone(stations: FacetedStation[], moss: number): FacetStoneBuild {
  if (!(moss >= 0) || moss > 1) throw new Error('Loft stone moss coverage must be between 0 and 1');
  const geometry = facetedLoft(stations);
  const array = geometry.getAttribute('position').array;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < array.length; i += 3) { minY = Math.min(minY, Number(array[i])); maxY = Math.max(maxY, Number(array[i])); }
  const height = maxY - minY;
  if (!(height > 0)) throw new Error('Loft stone collapsed');
  const stone: number[] = [], mossPositions: number[] = [];
  for (let i = 0; i < array.length; i += 9) {
    const tri = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(offset => Number(array[i + offset]));
    const ax = tri[0]!, ay = tri[1]!, az = tri[2]!, bx = tri[3]!, by = tri[4]!, bz = tri[5]!, cx = tri[6]!, cy = tri[7]!, cz = tri[8]!;
    const nx = (by - ay) * (cz - az) - (bz - az) * (cy - ay);
    const ny = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
    const nz = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const span = Math.hypot(nx, ny, nz);
    const low = Math.min(ay, by, cy);
    const grown = moss > 0 && span > 1e-12 && ny > 0.4 * span && low >= minY + height * (0.55 - moss * 0.12);
    (grown ? mossPositions : stone).push(...tri);
  }
  const parts = [{ role: 'stone' as const, positions: stone }, { role: 'moss' as const, positions: mossPositions }].filter(part => part.positions.length >= 9);
  if (!parts.some(part => part.role === 'stone')) throw new Error('Loft stone lost its stone surface');
  const volume = signedVolume(parts.flatMap(part => part.positions));
  if (volume < 0) for (const part of parts) flip(part.positions);
  if (!(Math.abs(volume) > 0)) throw new Error('Loft stone has no volume');
  assertShell(parts);
  let topY = -Infinity;
  const top: [number, number, number] = [0, 0, 0];
  for (const part of parts) for (let i = 0; i < part.positions.length; i += 3) if (part.positions[i + 1]! > topY) {
    topY = part.positions[i + 1]!;
    top[0] = part.positions[i]!; top[1] = topY; top[2] = part.positions[i + 2]!;
  }
  return { parts, top, triangles: parts.reduce((sum, part) => sum + part.positions.length / 9, 0) };
}
