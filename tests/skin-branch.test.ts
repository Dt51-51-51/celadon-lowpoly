import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { SkinMesh, type SkinBranch } from '../src/rigging/skin.ts';

function spreadRatio(mesh: SkinMesh, ring: number[]): number {
  const center = mesh.centroid(ring);
  const offsets = ring.map(index => mesh.position(index).sub(center));
  const normal = new Vector3();
  for (let i = 0; i < offsets.length; i++) {
    const a = offsets[i]!, b = offsets[(i + 1) % offsets.length]!;
    normal.x += (a.y - b.y) * (a.z + b.z);
    normal.y += (a.z - b.z) * (a.x + b.x);
    normal.z += (a.x - b.x) * (a.y + b.y);
  }
  if (normal.lengthSq() < 1e-12) return 0;
  normal.normalize();
  const helper = Math.abs(normal.y) < 0.9 ? new Vector3(0, 1, 0) : new Vector3(1, 0, 0);
  const xAxis = helper.clone().cross(normal).normalize();
  const yAxis = normal.clone().cross(xAxis).normalize();
  let xx = 0, xy = 0, yy = 0;
  for (const point of offsets) {
    const x = point.dot(xAxis), y = point.dot(yAxis);
    xx += x * x; xy += x * y; yy += y * y;
  }
  const trace = xx + yy;
  const gap = Math.sqrt(Math.max(0, trace * trace / 4 - (xx * yy - xy * xy)));
  const major = trace / 2 + gap;
  if (major < 1e-8) return 0;
  return (trace / 2 - gap) / major;
}

function meanRadius(mesh: SkinMesh, ring: number[]): number {
  const center = mesh.centroid(ring);
  return ring.reduce((sum, index) => sum + mesh.position(index).distanceTo(center), 0) / ring.length;
}

function signedVolume(mesh: SkinMesh): number {
  const geometry = mesh.toGeometry();
  const position = geometry.getAttribute('position'), index = geometry.index;
  if (!index) throw new Error('missing index');
  const centroid = new Vector3();
  for (let i = 0; i < position.count; i++) centroid.add(new Vector3(position.getX(i), position.getY(i), position.getZ(i)));
  centroid.multiplyScalar(1 / position.count);
  let volume = 0;
  for (let i = 0; i < index.count; i += 3) {
    const point = (slot: number) => { const vertex = index.getX(i + slot); return new Vector3(position.getX(vertex), position.getY(vertex), position.getZ(vertex)).sub(centroid); };
    const a = point(0), b = point(1), c = point(2);
    volume += a.dot(b.clone().cross(c));
  }
  geometry.dispose();
  return volume;
}

test('a branch grows a closed tube instead of a flat ribbon', () => {
  const mesh = new SkinMesh(true);
  const segments = 12;
  const stations = Array.from({length: 6}, (_, index) => ({center: new Vector3(0, 0.3, -0.25 + index * 0.1), rx: 0.12, ry: 0.09, weights: [[0, 1]] as [number, number][]}));
  const rings = mesh.sweep(stations, segments);
  const legGaps = [mesh.centeredGap(rings[2]!, new Vector3(1, -0.25, 0), 3), mesh.centeredGap(rings[2]!, new Vector3(-1, -0.25, 0), 3)];
  const eyeGaps = [mesh.centeredGap(rings[4]!, new Vector3(1, 0.35, 0.2), 3), mesh.centeredGap(rings[4]!, new Vector3(-1, 0.35, 0.2), 3)];
  const between = (index: number) => stations[index]!.center.clone().lerp(stations[index + 1]!.center, 0.5);
  const legs = mesh.bridgeExcept(rings[2]!, rings[3]!, legGaps, between(2));
  const eyes = mesh.bridgeExcept(rings[4]!, rings[5]!, eyeGaps, between(4));
  for (let index = 0; index < rings.length - 1; index++) if (index !== 2 && index !== 4) mesh.bridge(rings[index]!, rings[index + 1]!, between(index));
  mesh.cap(rings[0]!, stations[0]!.center.clone().add(new Vector3(0, 0, -0.05)), [[0, 1]], stations[0]!.center);
  mesh.cap(rings.at(-1)!, stations.at(-1)!.center.clone().add(new Vector3(0, 0, 0.05)), [[0, 1]], stations.at(-1)!.center);
  const fur: [number, number, number] = [0.6, 0.4, 0.3];
  const guarded = [...legs[0]!, ...legs[1]!, ...eyes[0]!, ...eyes[1]!].map(index => [index, mesh.position(index).toArray()] as const);
  for (const [hole, side] of [[legs[0]!, 1], [legs[1]!, -1]] as const) {
    const profiles: SkinBranch[] = [
      {point: new Vector3(side * 0.18, 0.16, -0.04), rx: 0.046, ry: 0.038, weights: [[1, 1]], color: fur},
      {point: new Vector3(side * 0.19, 0.06, 0.01), rx: 0.034, ry: 0.03, weights: [[1, 1]], color: fur},
      {point: new Vector3(side * 0.19, 0.03, 0.06), rx: 0.04, ry: 0.032, weights: [[1, 1]], color: fur},
    ];
    const foot = mesh.branch(hole, profiles, new Vector3(0, 0, 1));
    mesh.cap(foot, profiles[2]!.point.clone().add(new Vector3(0, 0, 0.03)), [[1, 1]], profiles[2]!.point, fur);
    const ratio = spreadRatio(mesh, foot), radius = meanRadius(mesh, foot);
    assert.ok(ratio > 0.5, 'limb cross-section collapsed to ' + ratio.toFixed(3));
    assert.ok(radius > 0.025 && radius < 0.05, 'limb radius ' + radius.toFixed(3));
  }
  for (const hole of eyes) {
    const outward = mesh.centroid(hole).sub(stations[4]!.center).normalize();
    const hub = mesh.seatRound(hole, outward, 0.02, [[0, 1]], [0.05, 0.04, 0.03], [0.9, 0.85, 0.75], [0.02, 0.01, 0.01]);
    assert.ok(mesh.position(hub).sub(mesh.centroid(hole)).dot(outward) > 0.008, 'eye does not rise out of its socket');
  }
  for (const [index, before] of guarded) assert.deepEqual(mesh.position(index).toArray(), before, 'branch moved a body vertex');
  assert.equal(mesh.shells(), 1);
  assert.equal(mesh.boundaryEdges(), 0);
  assert.equal(mesh.windingErrors(), 0);
  assert.ok(signedVolume(mesh) > 0, 'branch normals point inward');
});

test('a branch bends sharply to a flat foot without twisting inside out', () => {
  const mesh = new SkinMesh(true);
  const fur: [number, number, number] = [0.6, 0.4, 0.3];
  const stations = Array.from({length: 4}, (_, index) => ({center: new Vector3(0, 0.3, -0.15 + index * 0.1), rx: 0.12, ry: 0.09, weights: [[0, 1]] as [number, number][]}));
  const rings = mesh.sweep(stations, 12);
  const between = (index: number) => stations[index]!.center.clone().lerp(stations[index + 1]!.center, 0.5);
  const holes = mesh.bridgeExcept(rings[1]!, rings[2]!, [mesh.centeredGap(rings[1]!, new Vector3(1, -0.3, 0), 3)], between(1));
  mesh.bridge(rings[0]!, rings[1]!, between(0));
  mesh.bridge(rings[2]!, rings[3]!, between(2));
  mesh.cap(rings[0]!, stations[0]!.center.clone().add(new Vector3(0, 0, -0.05)), [[0, 1]], stations[0]!.center);
  mesh.cap(rings.at(-1)!, stations.at(-1)!.center.clone().add(new Vector3(0, 0, 0.05)), [[0, 1]], stations.at(-1)!.center);
  const foot = mesh.branch(holes[0]!, [
    {point: new Vector3(0.2, 0.2, -0.02), rx: 0.04, ry: 0.034, weights: [[1, 1]], color: fur},
    {point: new Vector3(0.22, 0.1, -0.08), rx: 0.03, ry: 0.026, weights: [[1, 1]], color: fur},
    {point: new Vector3(0.22, 0.045, 0.02), rx: 0.04, ry: 0.016, weights: [[1, 1]], color: fur, up: new Vector3(0, 1, 0)},
    {point: new Vector3(0.22, 0.045, 0.09), rx: 0.042, ry: 0.016, weights: [[1, 1]], color: fur, up: new Vector3(0, 1, 0)},
  ], new Vector3(0, 0, 1));
  mesh.cap(foot, new Vector3(0.22, 0.045, 0.13), [[1, 1]], new Vector3(0.22, 0.045, 0.09), fur);
  const xs = foot.map(index => mesh.position(index).x), ys = foot.map(index => mesh.position(index).y);
  assert.ok(Math.max(...ys) - Math.min(...ys) < (Math.max(...xs) - Math.min(...xs)) * 0.6, 'foot does not land flat');
  assert.equal(mesh.shells(), 1);
  assert.equal(mesh.boundaryEdges(), 0);
  assert.equal(mesh.windingErrors(), 0);
  assert.ok(signedVolume(mesh) > 0, 'branch normals point inward');
});

test('a branch rejects an empty chain and a collapsed section', () => {
  const mesh = new SkinMesh(true);
  const loop = mesh.ellipse(new Vector3(), new Vector3(1, 0, 0), new Vector3(0, 1, 0), 0.1, 0.1, 8, [[0, 1]]);
  assert.throws(() => mesh.branch(loop, []), /Skin branch is too short/);
  assert.throws(() => mesh.branch(loop, [{point: new Vector3(0, 0, 0.2), rx: 0, ry: 0.05, weights: [[0, 1]]}]), /Skin branch section collapsed/);
  assert.throws(() => mesh.seatRound(loop, new Vector3(0, 0, 1), 0, [[0, 1]], [0, 0, 0]), /Skin eye is too small/);
});

test('a sweep section can shape each axis independently', () => {
  const mesh = new SkinMesh(true);
  const section = (z: number) => ({center: new Vector3(0, 0.2, z), rx: 0.1, ry: 0.08, weights: [[0, 1]] as [number, number][], axisScale: (angle: number): [number, number] => [1, Math.sin(angle) > 0 ? 0.45 : 1]});
  const rings = mesh.sweep([section(-0.1), section(0.1)], 8);
  const side = mesh.position(rings[0]![0]!), top = mesh.position(rings[0]![2]!), bottom = mesh.position(rings[0]![6]!);
  assert.ok(Math.abs(side.x - 0.1) < 1e-6, 'side radius changed to ' + side.x.toFixed(4));
  assert.ok(Math.abs(top.y - 0.236) < 1e-6, 'top radius is ' + top.y.toFixed(4));
  assert.ok(Math.abs(bottom.y - 0.12) < 1e-6, 'bottom radius is ' + bottom.y.toFixed(4));
});

test('a dome cap rounds an open ring over several rings', () => {
  const mesh = new SkinMesh(true);
  const stations = [
    {center: new Vector3(0, 0.2, -0.1), rx: 0.08, ry: 0.06, weights: [[0, 1]] as [number, number][]},
    {center: new Vector3(0, 0.2, 0.1), rx: 0.08, ry: 0.06, weights: [[0, 1]] as [number, number][]},
  ];
  const rings = mesh.sweep(stations, 10);
  mesh.bridge(rings[0]!, rings[1]!, new Vector3(0, 0.2, 0));
  mesh.cap(rings[0]!, new Vector3(0, 0.2, -0.14), [[0, 1]], stations[0]!.center);
  const hub = mesh.domeCap(rings[1]!, new Vector3(0, 0, 1), 0.06, [[0, 1]], [0.6, 0.4, 0.3]);
  assert.ok(Math.abs(mesh.position(hub).z - 0.16) < 1e-6, 'dome hub is at ' + mesh.position(hub).z.toFixed(4));
  assert.ok(mesh.triangles >= 68, 'dome only made ' + mesh.triangles + ' triangles');
  assert.equal(mesh.shells(), 1);
  assert.equal(mesh.boundaryEdges(), 0);
  assert.equal(mesh.windingErrors(), 0);
  assert.ok(signedVolume(mesh) > 0, 'dome normals point inward');
  assert.throws(() => mesh.domeCap(rings[1]!, new Vector3(0, 0, 1), 0, [[0, 1]]), /Skin dome is too small/);
});

test('a branch keeps a flat leaf section flat and leaves the opening in place', () => {
  const mesh = new SkinMesh(true);
  const segments = 12;
  const stations = Array.from({length: 4}, (_, index) => ({center: new Vector3(0, 0.3, -0.15 + index * 0.1), rx: 0.12, ry: 0.09, weights: [[0, 1]] as [number, number][]}));
  const rings = mesh.sweep(stations, segments);
  const between = (index: number) => stations[index]!.center.clone().lerp(stations[index + 1]!.center, 0.5);
  const gaps = [mesh.centeredGap(rings[1]!, new Vector3(1, 0, 0), 3)];
  const holes = mesh.bridgeExcept(rings[1]!, rings[2]!, gaps, between(1));
  mesh.bridge(rings[0]!, rings[1]!, between(0));
  mesh.bridge(rings[2]!, rings[3]!, between(2));
  mesh.cap(rings[0]!, stations[0]!.center.clone().add(new Vector3(0, 0, -0.05)), [[0, 1]], stations[0]!.center);
  mesh.cap(rings.at(-1)!, stations.at(-1)!.center.clone().add(new Vector3(0, 0, 0.05)), [[0, 1]], stations.at(-1)!.center);
  const hole = holes[0]!;
  const guarded = hole.map(index => [index, mesh.position(index).toArray()] as const);
  const tip = mesh.branch(hole, [
    {point: new Vector3(0.24, 0.32, -0.04), rx: 0.05, ry: 0.018, weights: [[1, 1]], color: [0.6, 0.4, 0.3], up: new Vector3(0, 1, 0)},
    {point: new Vector3(0.34, 0.36, -0.03), rx: 0.034, ry: 0.014, weights: [[1, 1]], color: [0.6, 0.4, 0.3], up: new Vector3(0, 1, 0)},
  ], new Vector3(0, 1, 0));
  mesh.cap(tip, new Vector3(0.39, 0.38, -0.03), [[1, 1]], new Vector3(0.34, 0.36, -0.03), [0.6, 0.4, 0.3]);
  const ratio = spreadRatio(mesh, tip);
  assert.ok(ratio > 0.04 && ratio < 0.3, 'leaf section spread ratio ' + ratio.toFixed(3));
  for (const [index, before] of guarded) assert.deepEqual(mesh.position(index).toArray(), before, 'branch moved a body vertex');
  assert.equal(mesh.shells(), 1);
  assert.equal(mesh.boundaryEdges(), 0);
  assert.equal(mesh.windingErrors(), 0);
  assert.ok(signedVolume(mesh) > 0, 'branch normals point inward');
});
