import { BufferGeometry, IcosahedronGeometry, Vector3 } from 'three';

export function irregularClump(size: [number, number, number], random: () => number): BufferGeometry {
  const phase = random() * Math.PI * 2;
  const lobes = [0, 1, 2].map((i) => ({
    angle: phase + i * 2.094395 + random() * 0.55,
    y: -0.15 + random() * 0.7,
    gain: 0.1 + random() * 0.08,
  }));
  const geometry = new IcosahedronGeometry(1, 1);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const length = Math.hypot(x, y, z) || 1;
    const nx = x / length;
    const ny = y / length;
    const nz = z / length;
    const angle = Math.atan2(nz, nx);
    const ring = Math.hypot(nx, nz);
    let reach = 0.86 + 0.05 * Math.sin(angle * 3 + phase) * ring;
    for (const lobe of lobes) {
      const turn = Math.atan2(Math.sin(angle - lobe.angle), Math.cos(angle - lobe.angle));
      const dy = ny - lobe.y;
      reach += lobe.gain * Math.exp(-(turn * turn) / 0.7 - (dy * dy) / 0.4);
    }
    reach *= 0.82 + 0.18 * Math.pow((ny + 1) * 0.5, 0.75);
    position.setXYZ(i, nx * reach, ny * 0.94 * reach, nz * reach);
  }
  const flat = geometry.toNonIndexed();
  geometry.dispose();
  flat.computeBoundingBox();
  const bounds = flat.boundingBox!;
  const extent = bounds.getSize(new Vector3());
  const center = bounds.getCenter(new Vector3());
  flat.translate(-center.x, -center.y, -center.z);
  flat.scale(size[0] / Math.max(extent.x, 1e-6), size[1] / Math.max(extent.y, 1e-6), size[2] / Math.max(extent.z, 1e-6));
  flat.computeVertexNormals();
  return flat;
}
