import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, BufferGeometry, Mesh, Triangle, Vector3 } from 'three';
import { buildAsset, disposeAsset } from '../src/catalog/index.ts';
import { solidTuft } from '../src/engine/sculpt/tuft.ts';

function randomFrom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function triangles(geometry: BufferGeometry) {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const count = index ? index.count : position.count;
  const at = (i: number) => new Vector3().fromBufferAttribute(position, index ? index.getX(i) : i);
  const out: Vector3[][] = [];
  for (let i = 0; i < count; i += 3) out.push([at(i), at(i + 1), at(i + 2)]);
  return out;
}

function pointKey(point: Vector3) {
  return point.toArray().map(value => Math.round(value * 1e5)).join(',');
}

function edgeKey(a: Vector3, b: Vector3) {
  const left = pointKey(a), right = pointKey(b);
  return left < right ? left + '|' + right : right + '|' + left;
}

function shell(geometry: BufferGeometry, connected = true) {
  const faces = triangles(geometry);
  const edges = new Map<string, number[]>();
  faces.forEach((face, index) => {
    for (let side = 0; side < 3; side++) {
      const key = edgeKey(face[side]!, face[(side + 1) % 3]!);
      const users = edges.get(key) ?? [];
      users.push(index);
      edges.set(key, users);
    }
  });
  for (const users of edges.values()) assert.equal(users.length, 2);
  if (connected) {
    const seen = new Set<number>([0]);
    const stack = [0];
    while (stack.length) {
      const face = faces[stack.pop()!]!;
      for (let side = 0; side < 3; side++) for (const next of edges.get(edgeKey(face[side]!, face[(side + 1) % 3]!))!) if (!seen.has(next)) { seen.add(next); stack.push(next); }
    }
    assert.equal(seen.size, faces.length);
  }
  return faces;
}

function volume(faces: Vector3[][]) {
  let total = 0;
  for (const [a, b, c] of faces) total += a!.dot(b!.clone().cross(c!)) / 6;
  return total;
}

function inside(faces: Vector3[][], point: Vector3) {
  let winding = 0;
  for (const [a0, b0, c0] of faces) {
    const a = a0!.clone().sub(point), b = b0!.clone().sub(point), c = c0!.clone().sub(point);
    const la = a.length(), lb = b.length(), lc = c.length();
    if (Math.min(la, lb, lc) < 1e-7) return true;
    winding += 2 * Math.atan2(a.dot(b.clone().cross(c)), la * lb * lc + a.dot(b) * lc + b.dot(c) * la + c.dot(a) * lb);
  }
  return Math.abs(winding) > Math.PI * 2;
}

test('solid tuft is one closed foliage mass filling its envelope', () => {
  const length = 1.4, width = 0.72, depth = 0.34;
  const geometry = solidTuft(length, width, depth, randomFrom(11));
  const faces = shell(geometry);
  for (const [a, b, c] of faces) assert.ok(new Triangle(a!, b!, c!).getArea() > 1e-8);
  const bounds = geometry.boundingBox ?? new Box3().setFromBufferAttribute(geometry.getAttribute('position') as never);
  const size = bounds.getSize(new Vector3());
  assert.ok(Math.abs(size.x - depth) < 1e-4, 'depth ' + size.x);
  assert.ok(Math.abs(size.y - length) < 1e-4, 'length ' + size.y);
  assert.ok(Math.abs(size.z - width) < 1e-4, 'width ' + size.z);
  const box = size.x * size.y * size.z;
  const solid = Math.abs(volume(faces));
  assert.ok(solid > box * 0.1, 'volume fraction ' + (solid / box));
  assert.equal(inside(faces, new Vector3()), true);
  assert.equal(inside(faces, new Vector3(0, 0, width * 0.18)), true);
  assert.equal(inside(faces, new Vector3(depth, 0, 0)), false);
  const again = solidTuft(length, width, depth, randomFrom(11));
  const left = geometry.getAttribute('position').array;
  const same = again.getAttribute('position').array;
  for (let i = 0; i < left.length; i++) assert.equal(left[i], same[i]);
  const other = solidTuft(length, width, depth, randomFrom(29)).getAttribute('position').array;
  let delta = 0;
  for (let i = 0; i < left.length; i++) delta += Math.abs(Number(left[i]) - Number(other[i]));
  assert.ok(delta > 0.01);
});

test('conifer foliage sprays are fans of closed solid blades', () => {
  const build = buildAsset('conifer');
  try {
    const fans = build.root.children.filter((child): child is Mesh => child instanceof Mesh && child.name.startsWith('foliage-'));
    assert.ok(fans.length >= 35);
    for (const fan of fans) {
      const faces = shell(fan.geometry, false);
      const bounds = new Box3().setFromBufferAttribute(fan.geometry.getAttribute('position') as never);
      const size = bounds.getSize(new Vector3());
      const area = faces.reduce((sum, face) => sum + new Triangle(face[0]!, face[1]!, face[2]!).getArea(), 0);
      const depth = Math.abs(volume(faces)) / Math.max(area, 1e-8);
      const longest = Math.max(size.x, size.y, size.z);
      assert.ok(depth > longest * 0.015, fan.name + ' mean depth ' + depth + ' longest ' + longest);
    }
  } finally {
    disposeAsset(build);
  }
});
