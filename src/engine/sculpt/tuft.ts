import { BufferGeometry, Vector3 } from 'three';
import { facetedLoft } from '../geometry.ts';

export function solidTuft(length: number, width: number, depth: number, random: () => number): BufferGeometry {
  if (!(length > 0) || !(width > 0) || !(depth > 0)) throw new Error('Tuft size must be positive');
  const flare = 0.82 + random() * 0.16;
  const tip = 0.7 + random() * 0.45;
  const stations: Array<[number, number, number]> = [
    [0, 0.62, 0.9],
    [0.16, flare, 1],
    [0.4, 0.9, 0.82],
    [0.64, 0.58, 0.5],
    [0.84, 0.24 * tip, 0.22],
    [1, 0.04, 0.08],
  ];
  const geometry = facetedLoft(stations.map(([t, across, thick]) => ({
    center: [0, t, 0] as [number, number, number],
    outline: [
      [0, -across],
      [thick, 0],
      [0, across],
      [-thick, 0],
    ] as [number, number][],
  })));
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox!;
  const extent = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.scale(depth / Math.max(extent.x, 1e-6), length / Math.max(extent.y, 1e-6), width / Math.max(extent.z, 1e-6));
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  return geometry;
}
