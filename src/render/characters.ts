// Real animated characters (Quaternius CC0 GLBs) for the player rigs: model choice and scale, clip choice from
// PlayerState, upper-body swing overlay, racket-hand IK. The pure helpers at the top are unit tested; everything
// below them touches three.js objects and is only exercised in the browser.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Gender, PlayerAction, PlayerState, Side, Slot, Vec3 } from '../types';
import { MOVING_SPEED, heightOf } from '../sim/tuning';
import { solveTwoBoneIK, teamColor } from './pose';

// ---------------------------------------------------------------- pure helpers

export type CharacterClip = 'Idle' | 'Run' | 'Run_Back' | 'Run_Left' | 'Run_Right' | 'Roll';
export const BASE_CLIPS: readonly CharacterClip[] = ['Idle', 'Run', 'Run_Back', 'Run_Left', 'Run_Right', 'Roll'];

export interface ClipChoice {
  base: CharacterClip;
  timeScale: number; // playback speed of the base clip
  swing: boolean;    // a shot was released: play the upper-body swing on top
}

const RUN_REF_SPEED = 4; // m/s the Run clips look right at (BASE_TOP_SPEED of the sim)
const TIME_SCALE_MIN = 0.5;
const TIME_SCALE_MAX = 1.6;
const SWING_TIME_SCALE = 2.2; // Sword_Slash lasts 1.29 s, a shot is over in about half a second
const SWING_FADE_IN = 0.06;
const SWING_FADE_OUT = 0.12;
// Three averages the actions on a track by weight, so the overlay needs a big weight to win over the base clip.
const SWING_WEIGHT_GAIN = 12;
export const CROSSFADE = 0.15; // s
const MAX_ARM_STRETCH = 1.35; // the model's arm is shorter than the sim's reach; stretch up to this to meet the racket
const MAX_HIP_DROP = 0.08;

const FILES: Record<Gender, string> = { male: 'male_casual.glb', female: 'female_casual.glb' };
export const modelFileFor = (g: Gender): string => `/assets/characters/${FILES[g]}`;

export const heightScale = (target: number, modelHeight: number): number => (modelHeight > 0 ? target / modelHeight : 1);

export const clipKey = (name: string): string => name.slice(name.indexOf('|') + 1);

const UPPER_BODY = /^(Abdomen|Torso|Chest|Neck|Head|Shoulder|UpperArm|LowerArm|Wrist|Index|Middle|Ring|Pinky|Thumb)/;
export const isUpperBodyTrack = (trackName: string): boolean => UPPER_BODY.test(trackName);

// The shirt is the "Body_1" part in both models (male LightBrown, female White); "Body_2" is the skin.
export const isShirtMesh = (meshName: string): boolean => /_Body_1$/.test(meshName);

export function swingWeight(t: number, duration: number): number {
  return Math.max(0, Math.min(1, t / SWING_FADE_IN, (duration - t) / SWING_FADE_OUT));
}

// Small hip drop for crouches and lunges; the Roll clip brings its own body motion.
export function hipDropFor(action: PlayerAction, hipYOffset: number): number {
  if (action === 'diving' || action === 'down') return 0;
  return Math.max(-MAX_HIP_DROP, 0.5 * Math.min(0, hipYOffset));
}

export function clipFor(
  p: PlayerState,
  out: ClipChoice = { base: 'Idle', timeScale: 1, swing: false },
): ClipChoice {
  out.swing = p.action === 'swinging';
  out.timeScale = 1;
  if (p.action === 'diving' || p.action === 'down') {
    out.base = 'Roll';
    return out;
  }
  const speed = Math.hypot(p.vel.x, p.vel.z);
  if (speed <= MOVING_SPEED) {
    out.base = 'Idle';
    return out;
  }
  // Same facing convention as the rig: yaw = -facing (+pi for the far side), forward = (-sin yaw, -cos yaw)
  const yaw = -p.facing + (p.side === 'far' ? Math.PI : 0);
  const sin = Math.sin(yaw), cos = Math.cos(yaw);
  const fwd = -sin * p.vel.x - cos * p.vel.z;
  const right = cos * p.vel.x - sin * p.vel.z;
  out.base = Math.abs(fwd) >= Math.abs(right) ? (fwd > 0 ? 'Run' : 'Run_Back') : right > 0 ? 'Run_Right' : 'Run_Left';
  out.timeScale = Math.min(TIME_SCALE_MAX, Math.max(TIME_SCALE_MIN, speed / RUN_REF_SPEED));
  return out;
}

// ---------------------------------------------------------------- loading

interface Template {
  scene: THREE.Object3D;
  height: number; // metres, bind pose
  clips: Map<CharacterClip, THREE.AnimationClip>;
  swing: THREE.AnimationClip; // Sword_Slash with only the upper-body tracks
}
export type CharacterTemplates = Record<Gender, Template>;

async function loadTemplate(loader: GLTFLoader, gender: Gender): Promise<Template> {
  const gltf = await loader.loadAsync(modelFileFor(gender));
  const byName = new Map(gltf.animations.map((a) => [clipKey(a.name), a]));
  const clips = new Map<CharacterClip, THREE.AnimationClip>();
  for (const name of BASE_CLIPS) {
    const clip = byName.get(name);
    if (!clip) throw new Error(`${gender} model has no "${name}" clip`);
    clips.set(name, clip);
  }
  const slash = byName.get('Sword_Slash');
  if (!slash) throw new Error(`${gender} model has no "Sword_Slash" clip`);
  const swing = new THREE.AnimationClip('Swing', slash.duration, slash.tracks.filter((t) => isUpperBodyTrack(t.name)));
  const box = new THREE.Box3().setFromObject(gltf.scene, true);
  return { scene: gltf.scene, height: box.max.y - box.min.y, clips, swing };
}

/** Loads both models once. Rejects if either file or one of the clips is missing. */
export async function loadCharacterTemplates(): Promise<CharacterTemplates> {
  const loader = new GLTFLoader();
  const [male, female] = await Promise.all([loadTemplate(loader, 'male'), loadTemplate(loader, 'female')]);
  return { male, female };
}

// ---------------------------------------------------------------- one character on one rig

export interface CharacterInstance {
  gender: Gender;
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions: Record<CharacterClip, THREE.AnimationAction>;
  swing: THREE.AnimationAction;
  swingDuration: number;
  current: CharacterClip;
  swinging: boolean;
  modelHeight: number;
  shirt: THREE.MeshStandardMaterial[]; // this instance's own copies, so each team keeps its colour
  team: { side: Side; slot: Slot } | null;
  upperArm: THREE.Object3D;
  lowerArm: THREE.Object3D;
  wrist: THREE.Object3D;
}

// GLTFLoader strips dots from node names: "UpperArm.R" in Blender is "UpperArmR" here.
function bone(model: THREE.Object3D, name: string): THREE.Object3D {
  const b = model.getObjectByName(name);
  if (!b) throw new Error(`character has no bone "${name}"`);
  return b;
}

export function createCharacter(tpl: Template, gender: Gender): CharacterInstance {
  const model = cloneSkinned(tpl.scene);
  const shirt: THREE.MeshStandardMaterial[] = [];
  model.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    m.frustumCulled = false; // bounding spheres come from the bind pose, not the animated one
    if (isShirtMesh(m.name)) {
      const own = (m.material as THREE.MeshStandardMaterial).clone();
      m.material = own;
      shirt.push(own);
    }
  });
  const mixer = new THREE.AnimationMixer(model);
  const actions = {} as Record<CharacterClip, THREE.AnimationAction>;
  for (const name of BASE_CLIPS) {
    const a = mixer.clipAction(tpl.clips.get(name)!);
    if (name === 'Roll') a.setLoop(THREE.LoopOnce, 1).clampWhenFinished = true;
    actions[name] = a;
  }
  const swing = mixer.clipAction(tpl.swing);
  swing.setLoop(THREE.LoopOnce, 1);
  swing.setEffectiveTimeScale(SWING_TIME_SCALE);
  actions.Idle.play();
  return {
    gender,
    model,
    mixer,
    actions,
    swing,
    swingDuration: tpl.swing.duration,
    current: 'Idle',
    swinging: false,
    modelHeight: tpl.height,
    shirt,
    team: null,
    upperArm: bone(model, 'UpperArmR'),
    lowerArm: bone(model, 'LowerArmR'),
    wrist: bone(model, 'WristR'),
  };
}

const choice: ClipChoice = { base: 'Idle', timeScale: 1, swing: false };
const P = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3(), T = new THREE.Vector3();
const S = new THREE.Vector3(), E = new THREE.Vector3(), W = new THREE.Vector3();
const dq = new THREE.Quaternion(), wq = new THREE.Quaternion(), pq = new THREE.Quaternion();

// Turn `b` about its own joint so the direction towards `child` points at `target`.
function aimBone(b: THREE.Object3D, child: THREE.Object3D, target: Vec3): void {
  b.getWorldPosition(P);
  child.getWorldPosition(C);
  D.subVectors(C, P).normalize();
  T.set(target.x - P.x, target.y - P.y, target.z - P.z).normalize();
  dq.setFromUnitVectors(D, T);
  b.getWorldQuaternion(wq).premultiply(dq);
  b.parent!.getWorldQuaternion(pq).invert();
  b.quaternion.copy(pq.multiply(wq));
  b.updateWorldMatrix(false, true);
}

// Bend UpperArm.R / LowerArm.R so Wrist.R meets `grip` (world space), elbow towards `pole`.
function reachGrip(c: CharacterInstance, grip: Vec3, pole: Vec3): void {
  c.upperArm.getWorldPosition(S);
  c.lowerArm.getWorldPosition(E);
  c.wrist.getWorldPosition(W);
  const l1 = S.distanceTo(E), l2 = E.distanceTo(W);
  const dist = Math.hypot(grip.x - S.x, grip.y - S.y, grip.z - S.z);
  const s = Math.min(MAX_ARM_STRETCH, Math.max(1, dist / (l1 + l2)));
  const ik = solveTwoBoneIK(S, grip, l1 * s, l2 * s, pole);
  aimBone(c.upperArm, c.lowerArm, ik.elbow);
  c.upperArm.scale.setScalar(s);
  c.upperArm.updateWorldMatrix(false, true);
  aimBone(c.lowerArm, c.wrist, ik.wrist);
}

export function tintShirt(c: CharacterInstance, side: Side, slot: Slot): void {
  if (c.team && c.team.side === side && c.team.slot === slot) return;
  c.team = { side, slot };
  for (const m of c.shirt) m.color.setHex(teamColor(side, slot));
}

/**
 * Advance one character: pick and crossfade clips, place and scale the model, then bend the racket arm onto `grip`.
 * `yaw` is the rig's heading (forward = (-sin yaw, -cos yaw)); the model itself faces +z, hence the extra pi.
 */
export function updateCharacter(
  c: CharacterInstance,
  p: PlayerState,
  dt: number,
  yaw: number,
  hipYOffset: number,
  grip: Vec3,
  pole: Vec3,
): void {
  tintShirt(c, p.side, p.slot);

  clipFor(p, choice);
  if (choice.base !== c.current) {
    const next = c.actions[choice.base];
    next.reset().setEffectiveWeight(1).fadeIn(CROSSFADE).play();
    c.actions[c.current].fadeOut(CROSSFADE);
    c.current = choice.base;
  }
  c.actions[c.current].setEffectiveTimeScale(choice.timeScale);

  if (choice.swing && !c.swinging) c.swing.reset().play();
  c.swinging = choice.swing;
  if (c.swing.isRunning()) c.swing.setEffectiveWeight(SWING_WEIGHT_GAIN * swingWeight(c.swing.time, c.swingDuration));

  c.mixer.update(dt);

  const m = c.model;
  m.position.set(p.pos.x, p.pos.y + hipDropFor(p.action, hipYOffset), p.pos.z);
  m.rotation.set(0, yaw + Math.PI, 0);
  m.scale.setScalar(heightScale(heightOf(p.stats), c.modelHeight));
  c.upperArm.scale.setScalar(1);
  m.updateMatrixWorld(true);

  if (c.current !== 'Roll') reachGrip(c, grip, pole);
}
