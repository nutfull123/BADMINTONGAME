import * as THREE from 'three';
import type { GraphicsQuality } from '../types';
import { COURT } from '../physics';

/** The hall around the court. It owns the scene background, the floor and court mat, and every scene light. */
export interface Arena {
  setQuality(q: GraphicsQuality): void;
  /** Called every frame with the seconds since the renderer started. */
  update(elapsed: number): void;
  /** Frees what the renderer's scene traversal cannot reach: textures, environment maps, instance buffers. */
  dispose(): void;
}

/** `renderer` is for PMREMGenerator (environment lighting). */
export function createArena(scene: THREE.Scene, renderer: THREE.WebGLRenderer): Arena {
  scene.background = new THREE.Color(0x0b111e);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 46).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x1b2620, roughness: 0.9 }),
  );
  floor.position.y = -0.01;
  const courtMat = new THREE.Mesh(
    new THREE.PlaneGeometry(COURT.halfWidthDoubles * 2 + 1.8, COURT.halfLength * 2 + 1.8).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x266b49, roughness: 0.78 }),
  );
  const sun = new THREE.DirectionalLight(0xffffff, 1.35);
  sun.position.set(5, 12, 8);
  scene.add(floor, courtMat, new THREE.HemisphereLight(0xf8fafc, 0x334155, 1.7), sun);

  return { setQuality() {}, update() {}, dispose() {} };
}
