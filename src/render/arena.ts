import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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

export const HALL_DIMENSIONS = {
  halfWidth: 15,      // 30 m wide (x in -15..15)
  halfLength: 22,     // 44 m long (z in -22..22)
  ceilingHeight: 12,  // 12 m ceiling
} as const;

export const AD_BRANDS = ['BADMINTON 3D', 'SHUTTLE CUP', 'SMASH ARENA', 'NET KINGS'] as const;

export const HALL_FLOOR_COLOR = 0x5c4732;
export const COURT_MAT_COLOR = 0x1f7a4f;

export const ARENA_ASSETS = {
  hdri: '/assets/hdri/gym_01_1k.hdr',
  woodDiff: '/assets/textures/wooden_floor_01_diff_1k.jpg',
  woodNor: '/assets/textures/wooden_floor_01_nor_gl_1k.jpg',
  woodRough: '/assets/textures/wooden_floor_01_rough_1k.jpg',
  matNor: '/assets/textures/linoleum_brown_nor_gl_1k.jpg',
  matRough: '/assets/textures/linoleum_brown_rough_1k.jpg',
} as const;

/**
 * Returns texture anisotropy for a graphics quality preset, capped at 8 on high, 4 on medium, 1 on low.
 */
export function anisotropyForQuality(q: GraphicsQuality, maxAnisotropy: number): number {
  const hw = Number.isFinite(maxAnisotropy) && maxAnisotropy >= 1 ? Math.floor(maxAnisotropy) : 1;
  if (q === 'low') return 1;
  return Math.min(hw, q === 'medium' ? 4 : 8);
}

/**
 * Computes UV repeat counts so a texture covering `tileMeters` (default 2 m) tiles at real scale.
 */
export function computeSurfaceRepeat(widthMeters: number, lengthMeters: number, tileMeters = 2): { x: number; y: number } {
  const safeTile = tileMeters > 0 ? tileMeters : 2;
  return {
    x: widthMeters / safeTile,
    y: lengthMeters / safeTile,
  };
}

/**
 * Configures tiling, colour space and anisotropy on a texture without setting `needsUpdate = true`
 * (TextureLoader marks `needsUpdate` itself once the image data actually arrives).
 */
export function configureTiledTexture(
  tex: THREE.Texture,
  repeat: { x: number; y: number },
  isColor: boolean,
  anisotropy: number,
): THREE.Texture {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat.x, repeat.y);
  tex.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = anisotropy;
  return tex;
}

export type StandSide = 'west' | 'east' | 'far';

export interface StandSeat {
  stand: StandSide;
  row: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
  shirtColor: number;
  skinColor: number;
  phase: number;
}

export interface AdBoardPlacement {
  x: number;
  y: number;
  z: number;
  rotY: number;
  width: number;
  height: number;
  brandIndex: number;
}

export interface TierBlockPlacement {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

// Muted, darker shirt palette so spectators never compete with bright player kits or the white shuttle
const SPECTATOR_SHIRT_COLORS = [
  0x2c3e50,
  0x3b4252,
  0x4c566a,
  0x3d314a,
  0x2e473b,
  0x4a3b32,
  0x334155,
  0x3f3f46,
] as const;

const SPECTATOR_SKIN_COLORS = [
  0xe0b187,
  0xc9936b,
  0xa9714b,
  0x8a5738,
] as const;

const SIDE_STAND_START_X = 7.4;
const FAR_STAND_START_Z = -10.8;
const ROW_DEPTH = 1.25;
const ROW_RISE = 0.65;
const ROW_BASE_Y = 0.55;
const ROW_COUNT = 4;

/**
 * Generates tiered spectator seat placements across the west (`x <= -7`), east (`x >= 7`),
 * and far (`z <= -10.5`) stands. Ordered in interleaved round-robin across stands and rows
 * so the first half (`medium` quality) covers every stand and tier evenly.
 */
export function buildStandSeats(): StandSeat[] {
  const westSeats: StandSeat[] = [];
  const eastSeats: StandSeat[] = [];
  const farSeats: StandSeat[] = [];

  const sideZPositions = [-7.8, -5.2, -2.6, 0, 2.6, 5.2, 7.8];
  const farXPositions = [-6.0, -4.0, -2.0, 0, 2.0, 4.0, 6.0];
  // Column order puts even indices first, then odd indices, so when iterating column-major across rows
  // the first half of the array covers every row of every stand evenly.
  const colOrder = [0, 2, 4, 6, 1, 3, 5];

  let idx = 0;
  for (const c of colOrder) {
    for (let row = 0; row < ROW_COUNT; row++) {
      const y = ROW_BASE_Y + row * ROW_RISE;
      const xDist = SIDE_STAND_START_X + row * ROW_DEPTH;
      const zDist = FAR_STAND_START_Z - row * ROW_DEPTH;
      const z = sideZPositions[c] + (row % 2 === 0 ? -0.25 : 0.25);

      westSeats.push({
        stand: 'west',
        row,
        x: -xDist,
        y,
        z,
        rotY: Math.PI / 2,
        shirtColor: SPECTATOR_SHIRT_COLORS[idx % SPECTATOR_SHIRT_COLORS.length],
        skinColor: SPECTATOR_SKIN_COLORS[idx % SPECTATOR_SKIN_COLORS.length],
        phase: (idx * 1.37) % (Math.PI * 2),
      });
      idx++;

      eastSeats.push({
        stand: 'east',
        row,
        x: xDist,
        y,
        z: -z,
        rotY: -Math.PI / 2,
        shirtColor: SPECTATOR_SHIRT_COLORS[idx % SPECTATOR_SHIRT_COLORS.length],
        skinColor: SPECTATOR_SKIN_COLORS[idx % SPECTATOR_SKIN_COLORS.length],
        phase: (idx * 1.37) % (Math.PI * 2),
      });
      idx++;

      const x = farXPositions[c] + (row % 2 === 0 ? 0.22 : -0.22);
      farSeats.push({
        stand: 'far',
        row,
        x,
        y,
        z: zDist,
        rotY: 0,
        shirtColor: SPECTATOR_SHIRT_COLORS[idx % SPECTATOR_SHIRT_COLORS.length],
        skinColor: SPECTATOR_SKIN_COLORS[idx % SPECTATOR_SKIN_COLORS.length],
        phase: (idx * 1.37) % (Math.PI * 2),
      });
      idx++;
    }
  }

  // Interleave (west, east, far) so slicing the first half on 'medium' populates all three stands evenly
  const interleaved: StandSeat[] = [];
  const maxLen = Math.max(westSeats.length, eastSeats.length, farSeats.length);
  for (let i = 0; i < maxLen; i++) {
    if (i < westSeats.length) interleaved.push(westSeats[i]);
    if (i < eastSeats.length) interleaved.push(eastSeats[i]);
    if (i < farSeats.length) interleaved.push(farSeats[i]);
  }
  return interleaved;
}

/**
 * Returns the number of visible spectator instances for the requested graphics quality:
 * low = 0, medium = half, high = all.
 */
export function spectatorCountForQuality(q: GraphicsQuality, total: number): number {
  const safeTotal = Math.max(0, Math.floor(total));
  if (q === 'low') return 0;
  if (q === 'medium') return Math.floor(safeTotal * 0.5);
  return safeTotal;
}

/**
 * Computes a gentle vertical sway offset (in metres) for spectator idle motion on `high` quality.
 */
export function computeSpectatorSwayY(elapsed: number, phase: number): number {
  return Math.sin(elapsed * 2.2 + phase) * 0.032;
}

/**
 * Returns true if spectator sway matrices should be updated at `elapsed`.
 * Resets immediately if `elapsed < lastSwayUpdate` (clock restart).
 */
export function shouldUpdateSway(elapsed: number, lastSwayUpdate: number, interval: number): boolean {
  if (lastSwayUpdate < 0 || elapsed < lastSwayUpdate) return true;
  return elapsed - lastSwayUpdate >= interval;
}

/**
 * Builds the 0.9 m-tall perimeter A-frame advertising board placements along both long sides
 * (`|x| = 5.6`) and behind the far baseline (`z = -9.2`). Nothing is placed in the near camera corridor.
 */
export function buildAdBoardPlacements(): AdBoardPlacement[] {
  const height = 0.9;
  const y = height * 0.5;
  const sideWidth = 3.0;
  const sideZ = [-4.9, -1.7, 1.7, 4.9];
  const placements: AdBoardPlacement[] = [];
  let b = 0;

  for (const z of sideZ) {
    placements.push({
      x: -5.6,
      y,
      z,
      rotY: Math.PI / 2,
      width: sideWidth,
      height,
      brandIndex: b++ % AD_BRANDS.length,
    });
    placements.push({
      x: 5.6,
      y,
      z,
      rotY: -Math.PI / 2,
      width: sideWidth,
      height,
      brandIndex: b++ % AD_BRANDS.length,
    });
  }

  const farWidth = 3.6;
  for (const x of [-4.0, 0, 4.0]) {
    placements.push({
      x,
      y,
      z: -9.2,
      rotY: 0,
      width: farWidth,
      height,
      brandIndex: b++ % AD_BRANDS.length,
    });
  }

  return placements;
}

function buildTierBlockPlacements(): TierBlockPlacement[] {
  const blocks: TierBlockPlacement[] = [];
  const sideLength = 19.2; // z in -9.6..9.6
  const farWidth = 14.4;   // x in -7.2..7.2

  for (let row = 0; row < ROW_COUNT; row++) {
    const sy = ROW_BASE_Y + row * ROW_RISE;
    const y = sy * 0.5;
    const xDist = SIDE_STAND_START_X + row * ROW_DEPTH;
    const zDist = FAR_STAND_START_Z - row * ROW_DEPTH;

    // West stand step
    blocks.push({ x: -xDist, y, z: 0, sx: ROW_DEPTH, sy, sz: sideLength });
    // East stand step
    blocks.push({ x: xDist, y, z: 0, sx: ROW_DEPTH, sy, sz: sideLength });
    // Far baseline stand step
    blocks.push({ x: 0, y, z: zDist, sx: farWidth, sy, sz: ROW_DEPTH });
  }
  return blocks;
}

function createHallShellGeometry(): THREE.BufferGeometry {
  const W = HALL_DIMENSIONS.halfWidth * 2;
  const L = HALL_DIMENSIONS.halfLength * 2;
  const H = HALL_DIMENSIONS.ceilingHeight;

  // All 5 planes face INTO the hall so FrontSide culling hides any wall the camera moves behind
  const farWall = new THREE.PlaneGeometry(W, H);
  farWall.translate(0, H * 0.5, -HALL_DIMENSIONS.halfLength);

  const nearWall = new THREE.PlaneGeometry(W, H);
  nearWall.rotateY(Math.PI);
  nearWall.translate(0, H * 0.5, HALL_DIMENSIONS.halfLength);

  const westWall = new THREE.PlaneGeometry(L, H);
  westWall.rotateY(Math.PI / 2);
  westWall.translate(-HALL_DIMENSIONS.halfWidth, H * 0.5, 0);

  const eastWall = new THREE.PlaneGeometry(L, H);
  eastWall.rotateY(-Math.PI / 2);
  eastWall.translate(HALL_DIMENSIONS.halfWidth, H * 0.5, 0);

  const ceiling = new THREE.PlaneGeometry(W, L);
  ceiling.rotateX(Math.PI / 2);
  ceiling.translate(0, H, 0);

  const parts = [farWall, nearWall, westWall, eastWall, ceiling];
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

function createLightStripsGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const y = HALL_DIMENSIONS.ceilingHeight - 0.08;
  // Two longitudinal light banks flanking the court + cross light bars at far/near ends
  const stripXPositions = [-5.2, 5.2];
  const stripZPositions = [-11.5, -4.0, 4.0, 11.5];

  for (const x of stripXPositions) {
    for (const z of stripZPositions) {
      const strip = new THREE.PlaneGeometry(0.55, 5.4);
      strip.rotateX(Math.PI / 2); // faces down (-Y) into the hall
      strip.translate(x, y, z);
      parts.push(strip);
    }
  }
  for (const z of [-8.2, 8.2]) {
    const cross = new THREE.PlaneGeometry(6.8, 0.45);
    cross.rotateX(Math.PI / 2);
    cross.translate(0, y, z);
    parts.push(cross);
  }

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

function createAdAtlasTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const palettes = [
    { bg: '#0f2537', border: '#2a5c8a', accent: '#7dd3fc' },
    { bg: '#172b24', border: '#2e6f56', accent: '#6ee7b7' },
    { bg: '#261c33', border: '#5c427a', accent: '#c4b5fd' },
    { bg: '#2b2118', border: '#7c5836', accent: '#fcd34d' },
  ];

  const bandH = canvas.height / AD_BRANDS.length;
  for (let i = 0; i < AD_BRANDS.length; i++) {
    const y0 = i * bandH;
    const pal = palettes[i % palettes.length];

    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, y0, canvas.width, bandH);

    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 6;
    ctx.strokeRect(10, y0 + 10, canvas.width - 20, bandH - 20);

    // Side chevrons
    ctx.fillStyle = pal.border;
    ctx.fillRect(28, y0 + 26, 18, bandH - 52);
    ctx.fillRect(canvas.width - 46, y0 + 26, 18, bandH - 52);

    // Fictional brand headline
    ctx.fillStyle = pal.accent;
    ctx.font = 'bold 54px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(AD_BRANDS[i], canvas.width * 0.5, y0 + bandH * 0.52);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function createAdBoardsGeometry(placements: AdBoardPlacement[]): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const bandCount = AD_BRANDS.length;

  for (const b of placements) {
    const plane = new THREE.PlaneGeometry(b.width, b.height);
    // Remap V coordinates into this board's horizontal band in the shared 4-band atlas
    const uv = plane.getAttribute('uv') as THREE.BufferAttribute;
    const vMin = 1 - (b.brandIndex + 1) / bandCount;
    const vMax = 1 - b.brandIndex / bandCount;
    for (let i = 0; i < uv.count; i++) {
      const v = uv.getY(i);
      uv.setY(i, vMin + v * (vMax - vMin));
    }
    uv.needsUpdate = true;

    plane.rotateY(b.rotY);
    plane.translate(b.x, b.y, b.z);
    parts.push(plane);
  }

  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

function createSeatedBodyGeometry(): THREE.BufferGeometry {
  // Torso + seated lap/legs merged into a single low-poly mesh (~24 tris)
  const torso = new THREE.BoxGeometry(0.42, 0.48, 0.24);
  torso.translate(0, 0.24, -0.04);

  const thighs = new THREE.BoxGeometry(0.4, 0.16, 0.34);
  thighs.translate(0, 0.04, 0.12);

  const shins = new THREE.BoxGeometry(0.38, 0.34, 0.15);
  shins.translate(0, -0.17, 0.23);

  const parts = [torso, thighs, shins];
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

/** `renderer` is for PMREMGenerator (environment lighting). */
export function createArena(scene: THREE.Scene, renderer: THREE.WebGLRenderer): Arena {
  scene.background = new THREE.Color(0x0b111e);

  const floorW = HALL_DIMENSIONS.halfWidth * 2;
  const floorL = HALL_DIMENSIONS.halfLength * 2;
  const matW = COURT.halfWidthDoubles * 2 + 1.8;
  const matL = COURT.halfLength * 2 + 1.8;

  // 1. Warm wooden hall floor around the court (y = -0.01) & green court mat (y = 0)
  // Tinted by HALL_FLOOR_COLOR so the outer wood floor stays darker and less saturated than the court mat
  const floorMat = new THREE.MeshStandardMaterial({ color: HALL_FLOOR_COLOR, roughness: 0.78, metalness: 0.04 });
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(floorW, floorL).rotateX(-Math.PI / 2),
    floorMat,
  );
  floor.position.y = -0.01;

  const courtMatMaterial = new THREE.MeshStandardMaterial({
    color: COURT_MAT_COLOR,
    roughness: 0.65,
    metalness: 0.02,
    normalScale: new THREE.Vector2(0.45, 0.45),
  });
  const courtMat = new THREE.Mesh(
    new THREE.PlaneGeometry(matW, matL).rotateX(-Math.PI / 2),
    courtMatMaterial,
  );
  courtMat.position.y = 0;

  // 2. Hall walls and ceiling: 5 inward-facing FrontSide planes merged into 1 Mesh (culled when camera is outside)
  const hallShell = new THREE.Mesh(
    createHallShellGeometry(),
    new THREE.MeshStandardMaterial({
      color: 0x141c2b,
      roughness: 0.92,
      metalness: 0.05,
      side: THREE.FrontSide,
    }),
  );

  // 3. Emissive ceiling light strips (1 merged Mesh) + 3 real lights (1 Hemisphere + 2 Directional, no shadows)
  const lightStrips = new THREE.Mesh(
    createLightStripsGeometry(),
    new THREE.MeshBasicMaterial({ color: 0xf1f5f9, side: THREE.FrontSide }),
  );

  const hemiLight = new THREE.HemisphereLight(0xf8fafc, 0x263244, 0.95);
  const keyLight = new THREE.DirectionalLight(0xfffbeb, 0.9);
  keyLight.position.set(4.5, 11.5, 6.5);
  const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.45);
  fillLight.position.set(-4.5, 11.5, -6.5);

  // Environment map: RoomEnvironment fallback immediately, replaced by /assets/hdri/gym_01_1k.hdr once loaded
  let pmremGenerator: THREE.PMREMGenerator | null = null;
  let roomEnvRenderTarget: THREE.WebGLRenderTarget | null = null;
  let hdriRenderTarget: THREE.WebGLRenderTarget | null = null;
  let envTexture: THREE.Texture | null = null;
  try {
    pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment();
    roomEnvRenderTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    envTexture = roomEnvRenderTarget.texture;
    roomEnv.dispose();
  } catch (err) {
    console.warn('RoomEnvironment PMREM generation failed; falling back to direct lights:', err);
    envTexture = null;
  }

  // 4. Tiered stands along both long sides (|x| >= 7.4) and behind far baseline (z <= -10.8) — 1 InstancedMesh
  const tierPlacements = buildTierBlockPlacements();
  const standTierGeo = new THREE.BoxGeometry(1, 1, 1);
  const standTierMat = new THREE.MeshStandardMaterial({
    color: 0x1a2436,
    roughness: 0.88,
    metalness: 0.08,
  });
  const standsMesh = new THREE.InstancedMesh(standTierGeo, standTierMat, tierPlacements.length);
  const tmpMatrix = new THREE.Matrix4();
  const tmpPos = new THREE.Vector3();
  const tmpQuat = new THREE.Quaternion();
  const tmpScale = new THREE.Vector3();
  const tmpEuler = new THREE.Euler();
  const tmpColor = new THREE.Color();

  for (let i = 0; i < tierPlacements.length; i++) {
    const t = tierPlacements[i];
    tmpPos.set(t.x, t.y, t.z);
    tmpQuat.identity();
    tmpScale.set(t.sx, t.sy, t.sz);
    tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
    standsMesh.setMatrixAt(i, tmpMatrix);
  }
  standsMesh.instanceMatrix.needsUpdate = true;

  // 5. Advertising boards (0.9 m tall) — 1 merged Mesh sharing 1 CanvasTexture atlas
  const adPlacements = buildAdBoardPlacements();
  const adAtlas = createAdAtlasTexture();
  const adBoardsMesh = new THREE.Mesh(
    createAdBoardsGeometry(adPlacements),
    new THREE.MeshStandardMaterial({
      map: adAtlas,
      color: adAtlas ? 0xffffff : 0x1e3a5f,
      roughness: 0.72,
      metalness: 0.05,
      side: THREE.DoubleSide,
    }),
  );

  // 6. Spectators: 2 InstancedMeshes (bodies with varied shirt colours + heads with skin tones)
  const seats = buildStandSeats();
  const bodyGeo = createSeatedBodyGeometry();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.02 });
  const headGeo = new THREE.SphereGeometry(0.115, 10, 8);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, metalness: 0.02 });

  const spectatorBodies = new THREE.InstancedMesh(bodyGeo, bodyMat, seats.length);
  const spectatorHeads = new THREE.InstancedMesh(headGeo, headMat, seats.length);

  // Precompute quaternions per seat so update() does zero allocations and zero Euler conversions
  const seatQuats: THREE.Quaternion[] = seats.map((s) => {
    const q = new THREE.Quaternion();
    tmpEuler.set(0, s.rotY, 0);
    q.setFromEuler(tmpEuler);
    return q;
  });

  function writeSpectatorMatrices(activeCount: number, elapsed: number, withSway: boolean): void {
    tmpScale.set(1, 1, 1);
    for (let i = 0; i < activeCount; i++) {
      const s = seats[i];
      const swayY = withSway ? computeSpectatorSwayY(elapsed, s.phase) : 0;
      const q = seatQuats[i];

      tmpPos.set(s.x, s.y + 0.14 + swayY, s.z);
      tmpMatrix.compose(tmpPos, q, tmpScale);
      spectatorBodies.setMatrixAt(i, tmpMatrix);

      tmpPos.set(s.x, s.y + 0.72 + swayY * 1.15, s.z);
      tmpMatrix.compose(tmpPos, q, tmpScale);
      spectatorHeads.setMatrixAt(i, tmpMatrix);
    }
    spectatorBodies.instanceMatrix.needsUpdate = true;
    spectatorHeads.instanceMatrix.needsUpdate = true;
  }

  for (let i = 0; i < seats.length; i++) {
    tmpColor.setHex(seats[i].shirtColor);
    spectatorBodies.setColorAt(i, tmpColor);
    tmpColor.setHex(seats[i].skinColor);
    spectatorHeads.setColorAt(i, tmpColor);
  }
  if (spectatorBodies.instanceColor) spectatorBodies.instanceColor.needsUpdate = true;
  if (spectatorHeads.instanceColor) spectatorHeads.instanceColor.needsUpdate = true;

  writeSpectatorMatrices(seats.length, 0, false);

  scene.add(
    floor,
    courtMat,
    hallShell,
    lightStrips,
    standsMesh,
    adBoardsMesh,
    spectatorBodies,
    spectatorHeads,
    hemiLight,
    keyLight,
    fillLight,
  );

  let currentQuality: GraphicsQuality = 'high';
  let lastSwayUpdate = -1;
  const SWAY_INTERVAL = 0.22; // < 5 matrix updates per second (4.54 Hz)
  let disposed = false;

  // Lazy-loaded PBR surface textures & HDRI (only loaded on medium / high quality).
  // Each texture is assigned to its material ONLY inside its load callback once image data has arrived,
  // so an unloaded or failed file never sits on a material without image data.
  interface LoadedSurfaceTextures {
    woodDiff: THREE.Texture | null;
    woodNor: THREE.Texture | null;
    woodRough: THREE.Texture | null;
    matNor: THREE.Texture | null;
    matRough: THREE.Texture | null;
    all: THREE.Texture[];
  }
  let surfaceTextures: LoadedSurfaceTextures | null = null;
  let hdriLoadStarted = false;

  function maxHwAnisotropy(): number {
    try {
      return renderer.capabilities?.getMaxAnisotropy?.() ?? 1;
    } catch {
      return 1;
    }
  }

  function syncLoadedMapsToMaterials(): void {
    if (currentQuality === 'low' || !surfaceTextures) {
      if (floorMat.map || floorMat.normalMap || floorMat.roughnessMap) {
        floorMat.map = null;
        floorMat.normalMap = null;
        floorMat.roughnessMap = null;
        floorMat.needsUpdate = true;
      }
      if (courtMatMaterial.normalMap || courtMatMaterial.roughnessMap) {
        courtMatMaterial.normalMap = null;
        courtMatMaterial.roughnessMap = null;
        courtMatMaterial.needsUpdate = true;
      }
      return;
    }

    if (
      floorMat.map !== surfaceTextures.woodDiff ||
      floorMat.normalMap !== surfaceTextures.woodNor ||
      floorMat.roughnessMap !== surfaceTextures.woodRough
    ) {
      floorMat.map = surfaceTextures.woodDiff;
      floorMat.normalMap = surfaceTextures.woodNor;
      floorMat.roughnessMap = surfaceTextures.woodRough;
      floorMat.needsUpdate = true;
    }

    if (
      courtMatMaterial.normalMap !== surfaceTextures.matNor ||
      courtMatMaterial.roughnessMap !== surfaceTextures.matRough
    ) {
      courtMatMaterial.normalMap = surfaceTextures.matNor;
      courtMatMaterial.roughnessMap = surfaceTextures.matRough;
      courtMatMaterial.needsUpdate = true;
    }
  }

  function ensureHighOrMediumAssets(q: GraphicsQuality): void {
    const aniso = anisotropyForQuality(q, maxHwAnisotropy());

    if (!surfaceTextures) {
      const store: LoadedSurfaceTextures = {
        woodDiff: null,
        woodNor: null,
        woodRough: null,
        matNor: null,
        matRough: null,
        all: [],
      };
      surfaceTextures = store;

      const loader = new THREE.TextureLoader();
      const floorRep = computeSurfaceRepeat(floorW, floorL, 2);
      const matRep = computeSurfaceRepeat(matW, matL, 2);

      const loadMap = (
        url: string,
        rep: { x: number; y: number },
        isColor: boolean,
        slot: 'woodDiff' | 'woodNor' | 'woodRough' | 'matNor' | 'matRough',
      ): void => {
        const tex = loader.load(
          url,
          (loaded) => {
            if (disposed) {
              loaded.dispose();
              return;
            }
            configureTiledTexture(
              loaded,
              rep,
              isColor,
              anisotropyForQuality(currentQuality, maxHwAnisotropy()),
            );
            store[slot] = loaded;
            syncLoadedMapsToMaterials();
          },
          undefined,
          (err) => {
            console.warn(`Failed to load arena texture ${url}:`, err);
          },
        );
        configureTiledTexture(tex, rep, isColor, aniso);
        store.all.push(tex);
      };

      loadMap(ARENA_ASSETS.woodDiff, floorRep, true, 'woodDiff');
      loadMap(ARENA_ASSETS.woodNor, floorRep, false, 'woodNor');
      loadMap(ARENA_ASSETS.woodRough, floorRep, false, 'woodRough');
      loadMap(ARENA_ASSETS.matNor, matRep, false, 'matNor');
      loadMap(ARENA_ASSETS.matRough, matRep, false, 'matRough');
    } else {
      for (const tex of surfaceTextures.all) {
        tex.anisotropy = aniso;
      }
    }

    if (!hdriLoadStarted && pmremGenerator) {
      hdriLoadStarted = true;
      const hdrLoader = new HDRLoader();
      hdrLoader.load(
        ARENA_ASSETS.hdri,
        (hdrTex) => {
          if (disposed || !pmremGenerator) {
            hdrTex.dispose();
            return;
          }
          try {
            const target = pmremGenerator.fromEquirectangular(hdrTex);
            hdrTex.dispose();
            hdriRenderTarget?.dispose();
            hdriRenderTarget = target;
            envTexture = target.texture;
            if (currentQuality !== 'low') {
              scene.environment = envTexture;
              scene.environmentIntensity = 0.5;
            }
          } catch (err) {
            hdrTex.dispose();
            console.warn('HDRI PMREM generation failed; keeping RoomEnvironment fallback:', err);
          }
        },
        undefined,
        (err) => {
          console.warn(`Failed to load HDRI ${ARENA_ASSETS.hdri}; keeping RoomEnvironment fallback:`, err);
        },
      );
    }
  }

  function applySurfaceMaterials(q: GraphicsQuality): void {
    if (q !== 'low') {
      ensureHighOrMediumAssets(q);
    }
    syncLoadedMapsToMaterials();
  }

  function setQuality(q: GraphicsQuality): void {
    currentQuality = q;
    const count = spectatorCountForQuality(q, seats.length);
    spectatorBodies.count = count;
    spectatorHeads.count = count;
    spectatorBodies.visible = count > 0;
    spectatorHeads.visible = count > 0;

    applySurfaceMaterials(q);

    if (q === 'low' || !envTexture) {
      scene.environment = null;
      // Raise hemisphere & directional lights when environment map is off so brightness stays balanced
      hemiLight.intensity = 1.55;
      keyLight.intensity = 1.25;
      fillLight.intensity = 0.55;
    } else {
      scene.environment = envTexture;
      scene.environmentIntensity = 0.5;
      hemiLight.intensity = 0.95;
      keyLight.intensity = 0.9;
      fillLight.intensity = 0.45;
    }

    if (q === 'medium') {
      // Ensure static neutral pose on medium
      writeSpectatorMatrices(count, 0, false);
    }
  }

  function update(elapsed: number): void {
    if (currentQuality !== 'high') return;
    if (!shouldUpdateSway(elapsed, lastSwayUpdate, SWAY_INTERVAL)) return;
    lastSwayUpdate = elapsed;
    writeSpectatorMatrices(spectatorBodies.count, elapsed, true);
  }

  function dispose(): void {
    disposed = true;
    if (scene.environment === envTexture) {
      scene.environment = null;
    }
    if (surfaceTextures) {
      for (const tex of surfaceTextures.all) tex.dispose();
      surfaceTextures = null;
    }
    adAtlas?.dispose();
    hdriRenderTarget?.dispose();
    roomEnvRenderTarget?.dispose();
    pmremGenerator?.dispose();
    standsMesh.dispose();
    spectatorBodies.dispose();
    spectatorHeads.dispose();
  }

  // Start as high quality by default
  setQuality('high');

  return { setQuality, update, dispose };
}
