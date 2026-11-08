import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Mesh } from 'three';
import { rockClusterRecipe } from '../examples/recipes/rock-cluster/index.ts';

describe('facet stone clusters', () => {
  it('keeps monolith moss on the crown and pebbles as stone', () => {
    const built = rockClusterRecipe.build({ count: 1, size: 2.8, flatness: 1.2, pebbles: 8, colorway: 'mossy', seed: 9 });
    const meshes = built.root.children.filter((child): child is Mesh => child instanceof Mesh);
    const moss = meshes.filter(mesh => mesh.name.endsWith('-moss'));
    const pebbles = meshes.filter(mesh => mesh.name.startsWith('pebble-'));
    assert.equal(pebbles.length, 8);
    assert.equal(pebbles.some(mesh => mesh.name.endsWith('-moss')), false);
    assert.ok(moss.some(mesh => mesh.name === 'rock-0-moss'));
    let low = Infinity;
    for (const mesh of moss) {
      const position = mesh.geometry.getAttribute('position');
      const array = position.array;
      for (let index = 0; index < position.count; index++) low = Math.min(low, Number(array[index * 3 + 1]));
    }
    assert.ok(low > built.dimensions.y * 0.45);
    assert.ok(Math.abs(built.dimensions.y - 2.8) < 0.08);
  });

  it('builds the other catalog rock cases on the ground', () => {
    const cases = [
      {},
      { count: 7, size: 0.6, flatness: 0.35, spread: 1.6, colorway: 'sandstone', seed: 77 },
      { colorway: 'granite', count: 6, size: 1.1, spread: 1, flatness: 0.6, pebbles: 7, seed: 43384 },
    ];
    for (const parameters of cases) {
      const built = rockClusterRecipe.build(parameters);
      assert.ok(built.dimensions.y > 0);
      assert.ok(Math.abs(built.bounds.min.y) < 1e-3);
    }
  });
});
