import * as THREE from 'three';

/**
 * Racket with the centre of the head at the local origin, shaft and handle along -Y and the string face in the
 * local XY plane. The renderer turns +Y from the wrist through the head and puts the hand 0.44 m down -Y, so the
 * grip must stay centred there.
 */
export function createRacketMesh(): THREE.Group {
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3, metalness: 0.5 });
  const stringsMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.38,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });

  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.011, 8, 24), frameMat);
  const strings = new THREE.Mesh(new THREE.CircleGeometry(0.108, 16), stringsMat);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.24, 8), frameMat);
  // Shaft extends along -Y from head rim (-0.115) down to -0.355
  shaft.position.set(0, -0.235, 0);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.013, 0.16, 10), handleMat);
  // Handle extends from -0.355 down to -0.515 (grip sits around -0.45)
  handle.position.set(0, -0.435, 0);

  const racket = new THREE.Group();
  racket.add(frame, strings, shaft, handle);
  return racket;
}

/** Shuttlecock at 2.5x real size: cork along +Y (the renderer turns +Y to the flight direction), skirt toward -Y. */
export function createShuttlecockMesh(): THREE.Group {
  const group = new THREE.Group();

  const corkMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.25,
    emissive: 0x334155,
    emissiveIntensity: 0.35,
  });
  const skirtMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.4,
    emissive: 0x38bdf8,
    emissiveIntensity: 0.22,
    side: THREE.DoubleSide,
  });
  const bandMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.4,
  });

  // Cork hemisphere at the front (+Y)
  const corkGeo = new THREE.SphereGeometry(0.068, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const cork = new THREE.Mesh(corkGeo, corkMat);
  cork.position.y = 0.06;

  // Red trim band around cork base
  const bandGeo = new THREE.CylinderGeometry(0.07, 0.072, 0.022, 14);
  const band = new THREE.Mesh(bandGeo, bandMat);
  band.position.y = 0.05;

  // Open conical feather skirt flaring toward -Y
  const skirtGeo = new THREE.CylinderGeometry(0.068, 0.165, 0.22, 14, 1, true);
  const skirt = new THREE.Mesh(skirtGeo, skirtMat);
  skirt.position.y = -0.06;

  group.add(cork, band, skirt);
  return group;
}
