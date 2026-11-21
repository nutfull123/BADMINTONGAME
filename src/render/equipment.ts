import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- racket (real size, metres)

// Frame centreline ellipse; outer size = centreline + tube radius: 0.20 m wide, 0.23 m tall.
const TUBE_R = 0.011;
const HEAD_RX = 0.089;
const HEAD_RY = 0.104;
const THROAT_Y = -0.21; // where the two arms meet the shaft
const SHAFT_END_Y = -0.34;
const HANDLE_END_Y = -0.5425;
const MAINS = 20;
const CROSSES = 22;
const CELL = 8; // texels per string cell

class EllipseCurve3 extends THREE.Curve<THREE.Vector3> {
  constructor() {
    super();
  }
  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = t * Math.PI * 2;
    return target.set(Math.cos(a) * HEAD_RX, Math.sin(a) * HEAD_RY, 0);
  }
}

class HelixCurve3 extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly radius: number,
    private readonly y0: number,
    private readonly y1: number,
    private readonly turns: number,
  ) {
    super();
  }
  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = t * this.turns * Math.PI * 2;
    return target.set(Math.cos(a) * this.radius, this.y0 + (this.y1 - this.y0) * t, Math.sin(a) * this.radius);
  }
}

let stringTexture: THREE.DataTexture | undefined;
/** One small grid shared by every racket; mipmaps keep it from shimmering at a distance. Texels with alpha: bed + lines. */
function getStringTexture(): THREE.DataTexture {
  if (stringTexture) return stringTexture;
  const w = MAINS * CELL;
  const h = CROSSES * CELL;
  const data = new Uint8Array(w * h * 4).fill(255);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const line = x % CELL === CELL / 2 || y % CELL === CELL / 2;
      data[(y * w + x) * 4 + 3] = line ? 235 : 38;
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  stringTexture = tex;
  return tex;
}

const line = (a: THREE.Vector3, b: THREE.Vector3, r: number) =>
  new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, r, 8, false);

/**
 * Racket with the centre of the head at the local origin, shaft and handle along -Y and the string face in the
 * local XY plane. The renderer turns +Y from the wrist through the head and puts the hand 0.44 m down -Y, so the
 * grip stays centred there. Top of head to butt cap: 0.67 m. 3 meshes: frame, strings, handle.
 */
export function createRacketMesh(): THREE.Group {
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3, metalness: 0.5 });
  const stringsMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: getStringTexture(),
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const handleMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });

  // Frame + T-joint throat (two arms and a bridge) + tapered shaft, all one material.
  const armX = 0.05;
  const armY = -HEAD_RY * Math.sqrt(1 - (armX / HEAD_RX) ** 2);
  const throatTop = new THREE.Vector3(0, THROAT_Y, 0);
  const bridgeY = armY + (THROAT_Y - armY) * 0.5;
  const bridgeX = armX * (1 - 0.5);
  const bridge = new THREE.CylinderGeometry(0.007, 0.007, bridgeX * 2, 8).rotateZ(Math.PI / 2).translate(0, bridgeY, 0);
  const shaft = new THREE.CylinderGeometry(0.0075, 0.006, THROAT_Y - SHAFT_END_Y, 8).translate(0, (THROAT_Y + SHAFT_END_Y) / 2, 0);
  const frameGeo = mergeGeometries([
    new THREE.TubeGeometry(new EllipseCurve3(), 64, TUBE_R, 8, true),
    line(new THREE.Vector3(-armX, armY, 0), throatTop, 0.008),
    line(new THREE.Vector3(armX, armY, 0), throatTop, 0.008),
    bridge,
    shaft,
  ])!;
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.name = 'frame';

  // Translucent oval bed: unit circle UVs span the whole grid texture, scaled to the inside of the tube.
  const strings = new THREE.Mesh(
    new THREE.CircleGeometry(1, 32).scale(HEAD_RX - TUBE_R, HEAD_RY - TUBE_R, 1),
    stringsMat,
  );
  strings.name = 'strings';

  // Octagonal handle + spiral overwrap + butt cap, one material.
  const handleTop = SHAFT_END_Y;
  const gripLen = handleTop - HANDLE_END_Y;
  const handleGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.0125, 0.0145, gripLen, 8).translate(0, (handleTop + HANDLE_END_Y) / 2, 0),
    new THREE.TubeGeometry(new HelixCurve3(0.0142, handleTop - 0.008, HANDLE_END_Y + 0.008, 7), 96, 0.0022, 4, false),
    new THREE.CylinderGeometry(0.0165, 0.0165, 0.012, 8).translate(0, HANDLE_END_Y - 0.006, 0),
  ])!;
  const handle = new THREE.Mesh(handleGeo, handleMat);
  handle.name = 'handle';

  const racket = new THREE.Group();
  racket.add(frame, strings, handle);
  return racket;
}

// ---------------------------------------------------------------- shuttlecock (real size x SHUTTLE_SCALE)

const SHUTTLE_SCALE = 4;
const mm = (v: number) => v * 0.001 * SHUTTLE_SCALE;
const FEATHER_COUNT = 16;
const CORK_R = mm(13); // real cork diameter 26 mm
const FEATHER_TOP_Y = -mm(22); // feathers enter the cork band 22 mm behind the tip
const RIM_Y = -mm(88); // tip to rim 88 mm
const RIM_R = mm(32); // real rim diameter 64 mm

/** One quad per feather on the cone, 4 verts each, tilted a little around its own axis so neighbours overlap. */
function featherQuads(rTop: number, rRim: number, yTop: number, yRim: number, tilt: number, halfWTop: number, halfWRim: number) {
  const pos: number[] = [];
  const idx: number[] = [];
  const edge = (r: number, y: number, a: number, side: number, halfW: number, out: number) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    // tangent offset +/- halfW, radial offset +/- tilt (shingle effect)
    return [(r + side * out) * c - side * halfW * s, y, (r + side * out) * s + side * halfW * c];
  };
  for (let k = 0; k < FEATHER_COUNT; k++) {
    const a = (k / FEATHER_COUNT) * Math.PI * 2;
    pos.push(
      ...edge(rTop, yTop, a, -1, halfWTop, tilt * 0.3),
      ...edge(rTop, yTop, a, 1, halfWTop, tilt * 0.3),
      ...edge(rRim, yRim, a, -1, halfWRim, tilt),
      ...edge(rRim, yRim, a, 1, halfWRim, tilt),
    );
    const o = k * 4;
    idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Shuttlecock at 4x real size, origin at the cork tip (the point that touches the racket and the floor): cork
 * along +Y (the renderer turns +Y to the flight direction), skirt opening toward -Y. 4 meshes: cork, band,
 * 16-feather skirt, shafts + thread rings.
 */
export function createShuttlecockMesh(): THREE.Group {
  const white = { color: 0xf8fafc, roughness: 0.4, emissive: 0x38bdf8, emissiveIntensity: 0.22, side: THREE.DoubleSide };
  const corkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, emissive: 0x334155, emissiveIntensity: 0.35 });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 });
  const skirtMat = new THREE.MeshStandardMaterial(white);
  const shaftMat = new THREE.MeshStandardMaterial({ ...white, color: 0xe7dfc6, emissive: 0x334155 });

  const cork = new THREE.Mesh(
    new THREE.SphereGeometry(CORK_R, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, -CORK_R, 0),
    corkMat,
  );
  cork.name = 'cork';

  const bandH = FEATHER_TOP_Y + CORK_R; // from the dome equator down to where feathers start (negative)
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(CORK_R * 1.04, CORK_R * 1.04, -bandH, 16).translate(0, -CORK_R + bandH / 2, 0),
    bandMat,
  );
  band.name = 'band';

  const rTop = CORK_R * 1.04;
  const halfTop = (Math.PI * rTop) / FEATHER_COUNT; // touching at the top
  const halfRim = ((Math.PI * RIM_R) / FEATHER_COUNT) * 1.25; // 25% overlap at the rim
  const skirt = new THREE.Mesh(featherQuads(rTop, RIM_R, FEATHER_TOP_Y, RIM_Y, 0.004, halfTop, halfRim), skirtMat);
  skirt.name = 'skirt';

  // Shaft along each feather centre line (a thin strip just outside the vane) and two thread rings.
  const shafts = featherQuads(rTop + 0.0015, RIM_R + 0.0015, FEATHER_TOP_Y, RIM_Y, 0, 0.0016, 0.0016);
  const ring = (f: number) => {
    const r = rTop + (RIM_R - rTop) * f + 0.002;
    const g = new THREE.TorusGeometry(r, 0.0022, 4, 32).rotateX(Math.PI / 2).translate(0, FEATHER_TOP_Y + (RIM_Y - FEATHER_TOP_Y) * f, 0);
    g.deleteAttribute('uv');
    return g;
  };
  const threads = new THREE.Mesh(mergeGeometries([shafts, ring(0.45), ring(0.9)])!, shaftMat);
  threads.name = 'threads';

  const group = new THREE.Group();
  group.add(cork, band, skirt, threads);
  return group;
}
