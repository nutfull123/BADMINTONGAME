import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createRacketMesh, createShuttlecockMesh } from './equipment';

const meshes = (g: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) out.push(o as THREE.Mesh);
  });
  return out;
};
const box = (o: THREE.Object3D) => new THREE.Box3().setFromObject(o);
const byName = (g: THREE.Object3D, name: string) => meshes(g).find((m) => m.name === name)!;

describe('createRacketMesh', () => {
  const racket = createRacketMesh();
  const b = box(racket);

  it('is about 0.67 m long along Y and 0.20 m wide, head centre at the origin', () => {
    expect(b.max.y - b.min.y).toBeCloseTo(0.67, 1);
    expect(Math.abs(b.max.y - b.min.y - 0.67)).toBeLessThan(0.01);
    expect(Math.abs(b.max.x - b.min.x - 0.2)).toBeLessThan(0.01);
    expect(Math.abs(b.max.y - 0.115)).toBeLessThan(0.005); // head top
  });

  it('keeps the grip centred at y = -0.44', () => {
    const gb = new THREE.Box3().setFromObject(byName(racket, 'handle'));
    const butt = gb.min.y;
    const gripTop = -0.34; // handle starts just under the shaft
    expect(Math.abs((gripTop + butt) / 2 + 0.44)).toBeLessThan(0.03);
  });

  it('uses at most 4 meshes', () => {
    expect(meshes(racket).length).toBeLessThanOrEqual(4);
  });

  it('shares one mipmapped string texture between rackets', () => {
    const tex = (r: THREE.Group) => (byName(r, 'strings').material as THREE.MeshBasicMaterial).map;
    const a = tex(createRacketMesh());
    const c = tex(createRacketMesh());
    expect(a).toBeInstanceOf(THREE.DataTexture);
    expect(a).toBe(c);
    expect(a!.generateMipmaps).toBe(true);
  });

  it('returns a new group each call', () => {
    expect(createRacketMesh()).not.toBe(createRacketMesh());
  });
});

describe('racket frame', () => {
  it('has a shaft below the head that reaches the handle (no inverted parts)', () => {
    const fb = new THREE.Box3().setFromObject(byName(createRacketMesh(), 'frame'));
    expect(fb.min.y).toBeLessThan(-0.33);
    expect(fb.min.y).toBeGreaterThan(-0.35);
  });
});

describe('createShuttlecockMesh', () => {
  const shuttle = createShuttlecockMesh();
  const b = box(shuttle);

  it('has its cork tip at the origin and the skirt toward -Y', () => {
    expect(Math.abs(b.max.y)).toBeLessThan(0.002);
    expect(b.min.y).toBeLessThan(-0.3);
  });

  it('is about 0.26 m across the rim and 0.35 m long (within 10%)', () => {
    expect(Math.abs((b.max.x - b.min.x) / 0.26 - 1)).toBeLessThan(0.1);
    expect(Math.abs((b.max.y - b.min.y) / 0.35 - 1)).toBeLessThan(0.1);
  });

  it('has 16 feathers evenly spaced around the cone', () => {
    const pos = byName(shuttle, 'skirt').geometry.getAttribute('position');
    expect(pos.count % 16).toBe(0);
    const per = pos.count / 16;
    const angles: number[] = [];
    for (let f = 0; f < 16; f++) {
      let x = 0;
      let z = 0;
      for (let i = 0; i < per; i++) {
        x += pos.getX(f * per + i);
        z += pos.getZ(f * per + i);
      }
      angles.push(Math.atan2(z, x));
    }
    for (let f = 0; f < 16; f++) {
      const d = (angles[(f + 1) % 16] - angles[f] + 2 * Math.PI) % (2 * Math.PI);
      expect(Math.abs(d - (2 * Math.PI) / 16)).toBeLessThan(0.01);
    }
  });

  it('uses at most 4 meshes and keeps a slight emissive glow', () => {
    const ms = meshes(shuttle);
    expect(ms.length).toBeLessThanOrEqual(4);
    expect((byName(shuttle, 'skirt').material as THREE.MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0);
  });
});
