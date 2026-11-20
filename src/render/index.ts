import * as THREE from 'three';
import type { PlayerState, Side, Slot, Vec3, WorldView } from '../types';
import { heightOf } from '../sim/tuning';
import {
  MAX_RIGS,
  clampZoom,
  computeCameraFraming,
  computePlayerPose,
  computePulseScale,
  followedPlayer,
  proportionsOf,
  rigVisibility,
  teamColor,
  createTrailBuffer,
  pushTrailPoint,
  solveTwoBoneIK,
  stepZoom,
} from './pose';

const HALF_L = 6.7, HALF_W_D = 3.05, HALF_W_S = 2.59, SHORT_SVC = 1.98, LONG_SVC_D = 5.94;
const CAM_FOLLOW = 5; // lerp rate per second
const CAM_FOV_DEG = 50;
const LINE_W = 0.04;
const CHARGE_SEGMENTS = 48;
const TRAIL_MAX_POINTS = 24;

const flat = (g: THREE.BufferGeometry) => g.rotateX(-Math.PI / 2);
const basic = (color: number, opacity = 1) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    side: THREE.DoubleSide,
    depthWrite: opacity === 1,
  });

function buildCourt(scene: THREE.Scene) {
  const floor = new THREE.Mesh(
    flat(new THREE.PlaneGeometry(46, 46)),
    new THREE.MeshStandardMaterial({ color: 0x1b2620, roughness: 0.9 }),
  );
  floor.position.y = -0.01;
  const court = new THREE.Mesh(
    flat(new THREE.PlaneGeometry(HALF_W_D * 2 + 1.8, HALF_L * 2 + 1.8)),
    new THREE.MeshStandardMaterial({ color: 0x266b49, roughness: 0.78 }),
  );
  scene.add(floor, court);

  const lineMat = basic(0xffffff);
  const line = (w: number, l: number, x: number, z: number) => {
    const m = new THREE.Mesh(flat(new THREE.PlaneGeometry(w, l)), lineMat);
    m.position.set(x, 0.005, z);
    scene.add(m);
  };
  for (const x of [-HALF_W_D, -HALF_W_S, HALF_W_S, HALF_W_D]) line(LINE_W, HALF_L * 2, x, 0); // side lines
  for (const z of [-HALF_L, HALF_L]) line(HALF_W_D * 2, LINE_W, 0, z);                          // back lines
  for (const z of [-LONG_SVC_D, LONG_SVC_D]) line(HALF_W_D * 2, LINE_W, 0, z);                  // doubles long service
  for (const z of [-SHORT_SVC, SHORT_SVC]) line(HALF_W_D * 2, LINE_W, 0, z);                    // short service
  for (const s of [-1, 1]) line(LINE_W, HALF_L - SHORT_SVC, 0, s * (SHORT_SVC + (HALF_L - SHORT_SVC) / 2)); // centre

  // Net: 1.524 m at the centre, 1.55 m at the posts; modelled as a 0.76 m mesh under a white tape.
  const net = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W_D * 2, 0.76), basic(0x1f2937, 0.65));
  net.position.set(0, 1.55 - 0.38, 0);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(HALF_W_D * 2, 0.045, 0.024), basic(0xffffff));
  tape.position.set(0, 1.524, 0);
  scene.add(net, tape);
  const postGeo = new THREE.CylinderGeometry(0.032, 0.032, 1.55, 12);
  const postMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4, metalness: 0.3 });
  for (const x of [-HALF_W_D, HALF_W_D]) {
    const post = new THREE.Mesh(postGeo, postMat);
    post.position.set(x, 0.775, 0);
    scene.add(post);
  }

  scene.add(new THREE.HemisphereLight(0xf8fafc, 0x334155, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 1.35);
  sun.position.set(5, 12, 8);
  scene.add(sun);
}

interface SharedHumanAssets {
  limbGeo: THREE.CylinderGeometry;
  headGeo: THREE.SphereGeometry;
  torsoGeo: THREE.BoxGeometry;
  shortsGeo: THREE.BoxGeometry;
  footGeo: THREE.BoxGeometry;
  racketFrameGeo: THREE.TorusGeometry;
  racketStringsGeo: THREE.CircleGeometry;
  racketShaftGeo: THREE.CylinderGeometry;
  racketHandleGeo: THREE.CylinderGeometry;
  skinMat: THREE.MeshStandardMaterial;
  hairMat: THREE.MeshStandardMaterial;
  shortsMat: THREE.MeshStandardMaterial;
  shoeMat: THREE.MeshStandardMaterial;
  shirtMat: Record<Side, [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial]>;
  markerGeo: THREE.ConeGeometry;
  markerMat: THREE.MeshBasicMaterial;
  frameMat: THREE.MeshStandardMaterial;
  stringsMat: THREE.MeshBasicMaterial;
  handleMat: THREE.MeshStandardMaterial;
}

function createSharedHumanAssets(): SharedHumanAssets {
  return {
    limbGeo: new THREE.CylinderGeometry(1, 0.85, 1, 10),
    headGeo: new THREE.SphereGeometry(1, 14, 12),
    torsoGeo: new THREE.BoxGeometry(1, 1, 1),
    shortsGeo: new THREE.BoxGeometry(1, 1, 1),
    footGeo: new THREE.BoxGeometry(1, 1, 1),
    racketFrameGeo: new THREE.TorusGeometry(0.115, 0.011, 8, 24),
    racketStringsGeo: new THREE.CircleGeometry(0.108, 16),
    racketShaftGeo: new THREE.CylinderGeometry(0.006, 0.006, 0.24, 8),
    racketHandleGeo: new THREE.CylinderGeometry(0.014, 0.013, 0.16, 10),
    skinMat: new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.65 }),
    hairMat: new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 }),
    shortsMat: new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.75 }),
    shoeMat: new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 }),
    shirtMat: {
      near: [teamColor('near', 0), teamColor('near', 1)].map(
        (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.55 }),
      ) as [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial],
      far: [teamColor('far', 0), teamColor('far', 1)].map(
        (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.55 }),
      ) as [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial],
    },
    markerGeo: new THREE.ConeGeometry(0.12, 0.24, 12).rotateX(Math.PI), // tip points down at the head
    markerMat: new THREE.MeshBasicMaterial({ color: 0xff2bd6 }),
    frameMat: new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.3, metalness: 0.5 }),
    stringsMat: new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    handleMat: new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 }),
  };
}

interface HumanRig {
  side: Side;
  slot: Slot;
  ponytail: THREE.Mesh;
  marker: THREE.Mesh;
  root: THREE.Group;
  torso: THREE.Mesh;
  shorts: THREE.Mesh;
  head: THREE.Mesh;
  hair: THREE.Mesh;
  upperArmR: THREE.Mesh;
  forearmR: THREE.Mesh;
  upperArmL: THREE.Mesh;
  forearmL: THREE.Mesh;
  thighL: THREE.Mesh;
  shinL: THREE.Mesh;
  footL: THREE.Mesh;
  thighR: THREE.Mesh;
  shinR: THREE.Mesh;
  footR: THREE.Mesh;
  racketGroup: THREE.Group;
}

function createHumanRig(side: Side, assets: SharedHumanAssets): HumanRig {
  const root = new THREE.Group();
  const shirt = assets.shirtMat[side][0];

  const torso = new THREE.Mesh(assets.torsoGeo, shirt);
  const shorts = new THREE.Mesh(assets.shortsGeo, assets.shortsMat);
  const head = new THREE.Mesh(assets.headGeo, assets.skinMat);
  const hair = new THREE.Mesh(assets.headGeo, assets.hairMat);
  const ponytail = new THREE.Mesh(assets.headGeo, assets.hairMat);
  const marker = new THREE.Mesh(assets.markerGeo, assets.markerMat);
  ponytail.visible = marker.visible = false;

  const upperArmR = new THREE.Mesh(assets.limbGeo, shirt);
  const forearmR = new THREE.Mesh(assets.limbGeo, assets.skinMat);
  const upperArmL = new THREE.Mesh(assets.limbGeo, shirt);
  const forearmL = new THREE.Mesh(assets.limbGeo, assets.skinMat);

  const thighL = new THREE.Mesh(assets.limbGeo, assets.shortsMat);
  const shinL = new THREE.Mesh(assets.limbGeo, assets.skinMat);
  const footL = new THREE.Mesh(assets.footGeo, assets.shoeMat);
  const thighR = new THREE.Mesh(assets.limbGeo, assets.shortsMat);
  const shinR = new THREE.Mesh(assets.limbGeo, assets.skinMat);
  const footR = new THREE.Mesh(assets.footGeo, assets.shoeMat);

  // Build racket group with origin at the centre of the racket head (racketHead)
  const racketGroup = new THREE.Group();
  const frame = new THREE.Mesh(assets.racketFrameGeo, assets.frameMat);
  const strings = new THREE.Mesh(assets.racketStringsGeo, assets.stringsMat);
  const shaft = new THREE.Mesh(assets.racketShaftGeo, assets.frameMat);
  // Shaft extends along -Y from head rim (-0.115) down to -0.355
  shaft.position.set(0, -0.235, 0);
  const handle = new THREE.Mesh(assets.racketHandleGeo, assets.handleMat);
  // Handle extends from -0.355 down to -0.515 (grip sits around -0.45)
  handle.position.set(0, -0.435, 0);
  racketGroup.add(frame, strings, shaft, handle);

  root.add(
    torso,
    shorts,
    head,
    hair,
    ponytail,
    marker,
    upperArmR,
    forearmR,
    upperArmL,
    forearmL,
    thighL,
    shinL,
    footL,
    thighR,
    shinR,
    footR,
    racketGroup,
  );

  return {
    side,
    slot: 0,
    ponytail,
    marker,
    root,
    torso,
    shorts,
    head,
    hair,
    upperArmR,
    forearmR,
    upperArmL,
    forearmL,
    thighL,
    shinL,
    footL,
    thighR,
    shinR,
    footR,
    racketGroup,
  };
}

const upAxis = new THREE.Vector3(0, 1, 0);
const tmpVecA = new THREE.Vector3();
const tmpVecB = new THREE.Vector3();
const tmpDir = new THREE.Vector3();

function placeLimbBetween(mesh: THREE.Mesh, a: Vec3, b: Vec3, radius: number): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.max(0.02, Math.hypot(dx, dy, dz));
  mesh.position.set((a.x + b.x) * 0.5, (a.y + b.y) * 0.5, (a.z + b.z) * 0.5);
  mesh.scale.set(radius, len, radius);
  tmpDir.set(dx / len, dy / len, dz / len);
  mesh.quaternion.setFromUnitVectors(upAxis, tmpDir);
}

function updateHumanRig(
  rig: HumanRig,
  p: PlayerState,
  timeSeconds: number,
  assets: SharedHumanAssets,
  isHuman: boolean,
): void {
  if (rig.side !== p.side || rig.slot !== p.slot) {
    rig.side = p.side;
    rig.slot = p.slot;
    const shirt = assets.shirtMat[p.side][p.slot];
    rig.torso.material = shirt;
    rig.upperArmR.material = shirt;
    rig.upperArmL.material = shirt;
  }

  const h = heightOf(p.stats);
  const prop = proportionsOf(p.stats.gender);
  const pose = computePlayerPose(p, timeSeconds);
  const sgn = p.side === 'near' ? 1 : -1;

  // Forward unit vector for player facing
  const yaw = -p.facing + (p.side === 'far' ? Math.PI : 0);
  const cosY = Math.cos(yaw + pose.torsoTwistY * 0.45);
  const sinY = Math.sin(yaw + pose.torsoTwistY * 0.45);
  // Local +X is right, local -Z is forward
  const rightX = cosY;
  const rightZ = -sinY;
  const fwdX = -sinY;
  const fwdZ = -cosY;

  const hipBaseY = p.pos.y + Math.max(0.18, h * 0.48 + pose.hipYOffset);
  const torsoLen = h * 0.29;
  const sinPitch = Math.sin(pose.torsoPitchX);
  const cosPitch = Math.cos(pose.torsoPitchX);

  const hipPos: Vec3 = { x: p.pos.x, y: hipBaseY, z: p.pos.z };
  const chestTop: Vec3 = {
    x: hipPos.x + fwdX * torsoLen * sinPitch,
    y: hipPos.y + torsoLen * cosPitch,
    z: hipPos.z + fwdZ * torsoLen * sinPitch,
  };

  // Torso & shorts
  placeLimbBetween(rig.torso, hipPos, chestTop, 1);
  rig.torso.scale.set(h * 0.21 * prop.torso, torsoLen, h * 0.13);
  rig.torso.rotation.y += pose.torsoTwistY * 0.35;

  rig.shorts.position.set(hipPos.x, hipPos.y - h * 0.03, hipPos.z);
  rig.shorts.scale.set(h * 0.215 * prop.torso, h * 0.11, h * 0.135);
  rig.shorts.rotation.set(pose.torsoPitchX * 0.5, yaw, 0);

  // Head & hair cap
  const headRadius = h * 0.072;
  const headPos: Vec3 = {
    x: chestTop.x + fwdX * headRadius * 1.15 * sinPitch,
    y: chestTop.y + headRadius * 1.25 * cosPitch,
    z: chestTop.z + fwdZ * headRadius * 1.15 * sinPitch,
  };
  rig.head.position.set(headPos.x, headPos.y, headPos.z);
  rig.head.scale.setScalar(headRadius);
  rig.hair.position.set(headPos.x - fwdX * 0.01, headPos.y + headRadius * 0.22, headPos.z - fwdZ * 0.01);
  rig.hair.scale.set(headRadius * 1.04, headRadius * 0.85, headRadius * 1.06);

  // Ponytail: an ellipsoid hanging behind the head (women only)
  rig.ponytail.visible = prop.ponytail;
  if (prop.ponytail) {
    rig.ponytail.position.set(headPos.x - fwdX * headRadius * 1.15, headPos.y - headRadius * 0.7, headPos.z - fwdZ * headRadius * 1.15);
    rig.ponytail.scale.set(headRadius * 0.3, headRadius * 1.1, headRadius * 0.3);
  }

  // Human marker: a bright cone bobbing above the head
  rig.marker.visible = isHuman;
  if (isHuman) rig.marker.position.set(headPos.x, headPos.y + headRadius + 0.3 + Math.sin(timeSeconds * 4) * 0.04, headPos.z);

  // Shoulders
  const shoulderHalfW = h * prop.shoulder;
  const shoulderR: Vec3 = {
    x: chestTop.x + rightX * shoulderHalfW,
    y: chestTop.y - h * 0.025,
    z: chestTop.z + rightZ * shoulderHalfW,
  };
  const shoulderL: Vec3 = {
    x: chestTop.x - rightX * shoulderHalfW,
    y: chestTop.y - h * 0.025,
    z: chestTop.z - rightZ * shoulderHalfW,
  };

  // Racket placement at p.racketHead, handle pointing toward right shoulder
  const headWorld = p.racketHead;
  const toHeadX = headWorld.x - shoulderR.x;
  const toHeadY = headWorld.y - shoulderR.y + 0.18 + pose.swingPhaseOffset * 0.2;
  const toHeadZ = headWorld.z - shoulderR.z;
  const toHeadLen = Math.hypot(toHeadX, toHeadY, toHeadZ) || 1;
  const shaftDir: Vec3 = {
    x: toHeadX / toHeadLen,
    y: toHeadY / toHeadLen,
    z: toHeadZ / toHeadLen,
  };

  // Grip sits ~0.44 m down the shaft from racketHead toward the hand
  const gripLen = 0.44;
  const gripTarget: Vec3 = {
    x: headWorld.x - shaftDir.x * gripLen,
    y: headWorld.y - shaftDir.y * gripLen,
    z: headWorld.z - shaftDir.z * gripLen,
  };

  const upperArmLen = h * 0.175;
  const forearmLen = h * 0.165;
  const poleHint: Vec3 = {
    x: rightX * 0.35 - fwdX * 0.25,
    y: -0.85,
    z: rightZ * 0.35 - fwdZ * 0.25,
  };
  const ikR = solveTwoBoneIK(shoulderR, gripTarget, upperArmLen, forearmLen, poleHint);
  placeLimbBetween(rig.upperArmR, shoulderR, ikR.elbow, h * 0.032 * prop.limb);
  placeLimbBetween(rig.forearmR, ikR.elbow, ikR.wrist, h * 0.026 * prop.limb);

  // Orient racket so its +Y axis points from wrist through p.racketHead and its head centre sits at p.racketHead
  rig.racketGroup.position.set(headWorld.x, headWorld.y, headWorld.z);
  tmpVecA.set(headWorld.x - ikR.wrist.x, headWorld.y - ikR.wrist.y, headWorld.z - ikR.wrist.z);
  if (tmpVecA.lengthSq() > 1e-6) {
    tmpVecA.normalize();
  } else {
    tmpVecA.set(0, 1, 0);
  }
  rig.racketGroup.quaternion.setFromUnitVectors(upAxis, tmpVecA);

  // Off-arm (left arm balance pose)
  const elbowL: Vec3 = {
    x: shoulderL.x - rightX * (upperArmLen * pose.offArmSpread) + fwdX * (upperArmLen * -Math.sin(pose.offArmPitch)),
    y: shoulderL.y - upperArmLen * Math.cos(pose.offArmPitch),
    z: shoulderL.z - rightZ * (upperArmLen * pose.offArmSpread) + fwdZ * (upperArmLen * -Math.sin(pose.offArmPitch)),
  };
  const wristL: Vec3 = {
    x: elbowL.x - rightX * 0.06 + fwdX * (forearmLen * 0.75),
    y: elbowL.y - forearmLen * 0.45,
    z: elbowL.z - rightZ * 0.06 + fwdZ * (forearmLen * 0.75),
  };
  placeLimbBetween(rig.upperArmL, shoulderL, elbowL, h * 0.031 * prop.limb);
  placeLimbBetween(rig.forearmL, elbowL, wristL, h * 0.025 * prop.limb);

  // Legs (left and right)
  const hipHalfW = h * 0.068;
  const thighLen = h * 0.24;
  const shinLen = h * 0.23;

  const updateLeg = (
    sideSign: number,
    legPitch: number,
    legRoll: number,
    kneeBend: number,
    thighMesh: THREE.Mesh,
    shinMesh: THREE.Mesh,
    footMesh: THREE.Mesh,
  ) => {
    const hipJoint: Vec3 = {
      x: hipPos.x + rightX * hipHalfW * sideSign,
      y: hipPos.y - h * 0.03,
      z: hipPos.z + rightZ * hipHalfW * sideSign,
    };
    const latThigh = Math.sin(legRoll) * thighLen;
    const knee: Vec3 = pose.lyingFlat
      ? {
          x: hipJoint.x - fwdX * thighLen,
          y: p.pos.y + 0.08,
          z: hipJoint.z - fwdZ * thighLen,
        }
      : {
          x: hipJoint.x + fwdX * Math.sin(legPitch) * thighLen + rightX * latThigh,
          y: Math.max(p.pos.y + 0.14, hipJoint.y - Math.cos(legPitch) * Math.cos(legRoll) * thighLen),
          z: hipJoint.z + fwdZ * Math.sin(legPitch) * thighLen + rightZ * latThigh,
        };
    const anklePitch = legPitch - kneeBend;
    const latShin = Math.sin(legRoll) * shinLen;
    const ankle: Vec3 = pose.lyingFlat
      ? {
          x: knee.x - fwdX * shinLen,
          y: p.pos.y + 0.06,
          z: knee.z - fwdZ * shinLen,
        }
      : {
          x: knee.x + fwdX * Math.sin(anklePitch) * shinLen + rightX * latShin,
          y: Math.max(p.pos.y + 0.035, knee.y - Math.cos(anklePitch) * Math.cos(legRoll) * shinLen),
          z: knee.z + fwdZ * Math.sin(anklePitch) * shinLen + rightZ * latShin,
        };

    placeLimbBetween(thighMesh, hipJoint, knee, h * 0.044 * prop.limb);
    placeLimbBetween(shinMesh, knee, ankle, h * 0.033 * prop.limb);

    footMesh.position.set(
      ankle.x + fwdX * 0.045,
      ankle.y,
      ankle.z + fwdZ * 0.045,
    );
    footMesh.scale.set(0.085, 0.05, 0.18);
    footMesh.rotation.set(0, yaw + (sgn === -1 ? 0 : 0), 0);
  };

  updateLeg(-1, pose.leftLegPitch, pose.leftLegRoll, pose.leftKneeBend, rig.thighL, rig.shinL, rig.footL);
  updateLeg(1, pose.rightLegPitch, pose.rightLegRoll, pose.rightKneeBend, rig.thighR, rig.shinR, rig.footR);
}

function buildShuttleGroup(): THREE.Group {
  // 2.5x real size shuttlecock: cork hemisphere pointing along +Y, conical feather skirt behind it (-Y)
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

function createPreallocatedArcGeometry(innerR: number, outerR: number, segments: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const vertexCount = (segments + 1) * 2;
  const positions = new Float32Array(vertexCount * 3);
  const indices: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  updateArcGeometry(geo, innerR, outerR, segments, 0);
  return geo;
}

function updateArcGeometry(
  geo: THREE.BufferGeometry,
  innerR: number,
  outerR: number,
  segments: number,
  fraction: number,
): void {
  const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
  const arr = posAttr.array as Float32Array;
  const maxAngle = Math.PI * 2 * Math.max(0, Math.min(1, fraction));
  for (let i = 0; i <= segments; i++) {
    const theta = (i / segments) * maxAngle;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const idx = i * 6;
    arr[idx] = innerR * c;
    arr[idx + 1] = 0;
    arr[idx + 2] = -innerR * s;
    arr[idx + 3] = outerR * c;
    arr[idx + 4] = 0;
    arr[idx + 5] = -outerR * s;
  }
  posAttr.needsUpdate = true;
}

export function createRenderer(container: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b111e);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  buildCourt(scene);

  // Shuttlecock (cork hemisphere + feather skirt, 2.5x scale)
  const shuttle = buildShuttleGroup();

  // Floor shadow under shuttle
  const shadow = new THREE.Mesh(flat(new THREE.CircleGeometry(1, 24)), basic(0x000000, 0.55));
  shadow.position.y = 0.012;

  // Vertical drop line from shuttle down to its floor shadow (allocated once)
  const dropLinePositions = new Float32Array(6);
  const dropLineGeo = new THREE.BufferGeometry();
  dropLineGeo.setAttribute('position', new THREE.BufferAttribute(dropLinePositions, 3));
  const dropLineMat = new THREE.LineBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.48,
  });
  const dropLine = new THREE.Line(dropLineGeo, dropLineMat);

  // Fading shuttle trail (last ~0.3 s of positions, vertex colors updated in place)
  const trailBuffer = createTrailBuffer(0.3, TRAIL_MAX_POINTS);
  const trailPositions = new Float32Array(TRAIL_MAX_POINTS * 3);
  const trailColors = new Float32Array(TRAIL_MAX_POINTS * 3);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPositions, 3));
  trailGeo.setAttribute('color', new THREE.BufferAttribute(trailColors, 3));
  trailGeo.setDrawRange(0, 0);
  const trailMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
  });
  const trailLine = new THREE.Line(trailGeo, trailMat);

  // Landing marker: larger bright yellow ring (~0.6 m radius) that pulses, plus filled centre dot
  const landingGroup = new THREE.Group();
  landingGroup.position.y = 0.022;
  const landingOuterRing = new THREE.Mesh(
    flat(new THREE.RingGeometry(0.48, 0.62, 40)),
    basic(0xffe600, 0.95),
  );
  const landingCentreDot = new THREE.Mesh(
    flat(new THREE.CircleGeometry(0.14, 24)),
    basic(0xffe600, 0.9),
  );
  landingGroup.add(landingOuterRing, landingCentreDot);

  // Timing ring around near player
  const timing = new THREE.Mesh(flat(new THREE.RingGeometry(0.7, 0.76, 48)), basic(0xffffff));
  timing.position.y = 0.02;

  // Charge arc (allocated once and updated via buffer attribute)
  const chargeArcGeo = createPreallocatedArcGeometry(0.9, 0.98, CHARGE_SEGMENTS);
  const chargeArc = new THREE.Mesh(chargeArcGeo, basic(0xff7a00));
  chargeArc.position.y = 0.02;

  scene.add(shuttle, shadow, dropLine, trailLine, landingGroup, timing, chargeArc);

  // Racket aid (view.aim): ring on the racket face (cyan FH / orange BH + letter), ring on the live incoming
  // shuttle (white, green once close enough to hit), and a line between them. Drawn on top.
  const onTop = <M extends THREE.Material>(m: M) => { m.depthTest = false; m.transparent = true; return m; };
  const AIM_FH = 0x3fd0ff, AIM_BH = 0xff8a3d, AIM_ON = 0x39ff6a;
  const aimRacket = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.14, 32), onTop(basic(AIM_FH)));
  const aimTarget = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.21, 32), onTop(basic(0xffffff)));
  const aimLinePositions = new Float32Array(6);
  const aimLineGeo = new THREE.BufferGeometry();
  aimLineGeo.setAttribute('position', new THREE.BufferAttribute(aimLinePositions, 3));
  const aimLine = new THREE.Line(aimLineGeo, onTop(new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.6 })));
  aimLine.frustumCulled = false; // positions change every frame; the bounding sphere is never recomputed
  const labelTextures: THREE.Texture[] = [];
  const sideLabel = (text: string, color: string) => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 32;
    const g = c.getContext('2d')!;
    g.font = 'bold 26px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = color; g.fillText(text, 32, 17);
    const tex = new THREE.CanvasTexture(c);
    labelTextures.push(tex);
    const s = new THREE.Sprite(onTop(new THREE.SpriteMaterial({ map: tex })));
    s.scale.set(0.36, 0.18, 1);
    return s;
  };
  const fhLabel = sideLabel('FH', '#3fd0ff');
  const bhLabel = sideLabel('BH', '#ff8a3d');
  for (const o of [aimRacket, aimTarget, aimLine, fhLabel, bhLabel]) o.renderOrder = 10;
  scene.add(aimRacket, aimTarget, aimLine, fhLabel, bhLabel);

  // Pre-allocate two human player rigs once and reuse every frame
  const humanAssets = createSharedHumanAssets();
  const rigs: HumanRig[] = Array.from({ length: MAX_RIGS }, (_, i) =>
    createHumanRig(i % 2 === 0 ? 'near' : 'far', humanAssets),
  );
  for (const rig of rigs) scene.add(rig.root);

  let camX = 0;
  let elapsed = 0;
  let chargeShown = -1;
  let targetZoom = 1;
  let currentZoom = 1;

  function setZoom(z: number) {
    targetZoom = clampZoom(z);
  }

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function render(view: WorldView, dt: number) {
    elapsed += Math.max(0, dt);

    // Update human player rigs
    const shown = rigVisibility(view.players.length);
    const near = followedPlayer(view.players, view.human);
    for (let i = 0; i < rigs.length; i++) {
      const p = view.players[i];
      rigs[i].root.visible = shown[i];
      if (p) updateHumanRig(rigs[i], p, elapsed, humanAssets, p === near);
    }

    // Smooth camera follow + aspect/FOV-computed framing of both baselines & sidelines + zoom easing
    if (near) camX += (near.pos.x - camX) * (1 - Math.exp(-CAM_FOLLOW * dt));
    currentZoom = stepZoom(currentZoom, targetZoom, dt);
    const framing = computeCameraFraming(camera.aspect, CAM_FOV_DEG, camX, currentZoom);
    camera.position.set(framing.pos.x, framing.pos.y, framing.pos.z);
    camera.lookAt(framing.lookAt.x, framing.lookAt.y, framing.lookAt.z);

    // Shuttle orientation (cork-first along velocity)
    const { pos, vel } = view.shuttle;
    shuttle.position.set(pos.x, pos.y, pos.z);
    tmpVecB.set(vel.x, vel.y, vel.z);
    if (tmpVecB.lengthSq() > 1e-5) {
      shuttle.quaternion.setFromUnitVectors(upAxis, tmpVecB.normalize());
    }

    // Floor shadow & vertical drop line
    shadow.position.set(pos.x, 0.012, pos.z);
    shadow.scale.set(0.18 + 0.025 * pos.y, 1, 0.12 + 0.018 * pos.y);

    dropLinePositions[0] = pos.x;
    dropLinePositions[1] = Math.max(0.015, pos.y);
    dropLinePositions[2] = pos.z;
    dropLinePositions[3] = pos.x;
    dropLinePositions[4] = 0.012;
    dropLinePositions[5] = pos.z;
    (dropLineGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

    // Shuttle trail (~0.3 s)
    pushTrailPoint(trailBuffer, pos, elapsed);
    const pts = trailBuffer.points;
    const count = pts.length;
    for (let i = 0; i < count; i++) {
      const pt = pts[i];
      const ageFrac = count > 1 ? i / (count - 1) : 1; // 0 = oldest (faded), 1 = newest (bright)
      const base = i * 3;
      trailPositions[base] = pt.pos.x;
      trailPositions[base + 1] = pt.pos.y;
      trailPositions[base + 2] = pt.pos.z;
      // Fade from dark slate to bright cyan-white near shuttle
      trailColors[base] = 0.15 + 0.85 * ageFrac;
      trailColors[base + 1] = 0.25 + 0.75 * ageFrac;
      trailColors[base + 2] = 0.35 + 0.65 * ageFrac;
    }
    trailGeo.setDrawRange(0, count);
    (trailGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (trailGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;

    // Pulsing landing marker
    landingGroup.visible = view.landing !== null;
    if (view.landing) {
      landingGroup.position.set(view.landing.x, 0.022, view.landing.z);
      const pulse = computePulseScale(elapsed);
      landingOuterRing.scale.setScalar(pulse);
    }

    // Timing ring
    timing.visible = view.timingRing !== null && !!near;
    if (view.timingRing !== null && near) {
      timing.position.set(near.pos.x, 0.02, near.pos.z);
      timing.scale.setScalar(1 + (1 - view.timingRing) * 1.5);
      (timing.material as THREE.MeshBasicMaterial).color.setHex(
        view.timingRing > 0.85 ? 0x39ff6a : 0xffffff,
      );
    }

    // Charge arc (in-place vertex update, no geometry allocation per frame)
    const c = view.charge;
    chargeArc.visible = c !== null && c > 0 && !!near;
    if (c !== null && c > 0 && near) {
      chargeArc.position.set(near.pos.x, 0.02, near.pos.z);
      if (Math.abs(c - chargeShown) > 0.005) {
        updateArcGeometry(chargeArcGeo, 0.9, 0.98, CHARGE_SEGMENTS, c);
        chargeShown = c;
      }
    }

    // Racket aid
    const aim = view.aim ?? null;
    const fh = aim?.side === 'forehand';
    aimRacket.visible = fhLabel.visible = bhLabel.visible = aimTarget.visible = aimLine.visible = false;
    if (aim) {
      const r = aim.racket;
      aimRacket.visible = true;
      aimRacket.position.set(r.x, r.y, r.z);
      aimRacket.quaternion.copy(camera.quaternion);
      (aimRacket.material as THREE.MeshBasicMaterial).color.setHex(fh ? AIM_FH : AIM_BH);
      const label = fh ? fhLabel : bhLabel;
      label.visible = true;
      label.position.set(r.x, r.y + 0.28, r.z);
      const t = aim.target;
      if (t) {
        aimTarget.visible = aimLine.visible = true;
        aimTarget.position.set(t.x, t.y, t.z);
        aimTarget.quaternion.copy(camera.quaternion);
        (aimTarget.material as THREE.MeshBasicMaterial).color.setHex(aim.onTarget ? AIM_ON : 0xffffff);
        aimLinePositions.set([r.x, r.y, r.z, t.x, t.y, t.z]);
        (aimLineGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      }
    }

    renderer.render(scene, camera);
  }

  function dispose() {
    window.removeEventListener('resize', resize);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) geometries.add(m.geometry);
      if (m.material) {
        for (const mat of [m.material].flat()) materials.add(mat);
      }
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    labelTextures.forEach((t) => t.dispose());
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { render, resize, dispose, setZoom };
}
