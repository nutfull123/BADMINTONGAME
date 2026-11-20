import * as THREE from 'three';
import type { BodyType, WorldView } from '../types';

const HEIGHT: Record<BodyType, number> = { tall: 1.95, balanced: 1.78, short: 1.63 };
const HALF_L = 6.7, HALF_W_D = 3.05, HALF_W_S = 2.59, SHORT_SVC = 1.98, LONG_SVC_D = 5.94;
const CAM_FOLLOW = 5; // lerp rate per second
const LINE_W = 0.04;

const flat = (g: THREE.BufferGeometry) => g.rotateX(-Math.PI / 2);
const basic = (color: number, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, side: THREE.DoubleSide, depthWrite: opacity === 1 });

function buildCourt(scene: THREE.Scene) {
  const floor = new THREE.Mesh(flat(new THREE.PlaneGeometry(40, 40)), new THREE.MeshLambertMaterial({ color: 0x2b3a2f }));
  floor.position.y = -0.01;
  const court = new THREE.Mesh(flat(new THREE.PlaneGeometry(HALF_W_D * 2 + 1.6, HALF_L * 2 + 1.6)), new THREE.MeshLambertMaterial({ color: 0x2f6f4f }));
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
  const net = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W_D * 2, 0.76), basic(0x222222, 0.6));
  net.position.set(0, 1.55 - 0.38, 0);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(HALF_W_D * 2, 0.04, 0.02), basic(0xffffff));
  tape.position.set(0, 1.524, 0);
  scene.add(net, tape);
  for (const x of [-HALF_W_D, HALF_W_D]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.55), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    post.position.set(x, 0.775, 0);
    scene.add(post);
  }

  scene.add(new THREE.HemisphereLight(0xffffff, 0x445544, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(4, 10, 6);
  scene.add(sun);
}

interface PlayerMeshes { key: string; body: THREE.Mesh; racket: THREE.Mesh }

export function createRenderer(container: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x10151a);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  buildCourt(scene);

  const shuttle = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 12), basic(0xffffff));
  const shadow = new THREE.Mesh(flat(new THREE.CircleGeometry(1, 24)), basic(0x000000, 0.5));
  const landing = new THREE.Mesh(flat(new THREE.RingGeometry(0.25, 0.32, 32)), basic(0xffd400));
  const timing = new THREE.Mesh(flat(new THREE.RingGeometry(0.7, 0.75, 48)), basic(0xffffff));
  const chargeArc = new THREE.Mesh(new THREE.BufferGeometry(), basic(0xff7a00));
  for (const m of [landing, timing, chargeArc]) m.position.y = 0.02;
  shadow.position.y = 0.012;
  scene.add(shuttle, shadow, landing, timing, chargeArc);

  const players: PlayerMeshes[] = [];
  const bodyMat = { near: basic(0x2f6bff), far: basic(0xe03a3a) };
  const racketMat = basic(0xffffff);
  const racketGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.02, 16).rotateX(Math.PI / 2);

  let camX = 0;
  let chargeShown = -1;
  const up = new THREE.Vector3(0, 1, 0);
  const dir = new THREE.Vector3();

  function resize() {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function render(view: WorldView, dt: number) {
    view.players.forEach((p, i) => {
      const h = HEIGHT[p.stats.body], r = 0.25;
      const key = `${p.side}-${p.stats.body}`;
      let pm = players[i];
      if (pm?.key !== key) {
        if (pm) { scene.remove(pm.body, pm.racket); pm.body.geometry.dispose(); }
        pm = players[i] = {
          key,
          body: new THREE.Mesh(new THREE.CapsuleGeometry(r, h - 2 * r, 4, 12), bodyMat[p.side]),
          racket: new THREE.Mesh(racketGeo, racketMat),
        };
        scene.add(pm.body, pm.racket);
      }
      pm.body.position.set(p.pos.x, p.pos.y + h / 2, p.pos.z);
      pm.body.rotation.y = -p.facing;
      pm.racket.position.set(p.racketHead.x, p.racketHead.y, p.racketHead.z);
    });

    const near = view.players.find((p) => p.side === 'near');
    if (near) camX += (near.pos.x - camX) * (1 - Math.exp(-CAM_FOLLOW * dt));
    camera.position.set(camX, 4.5, 10);
    camera.lookAt(camX, 1, -2);

    const { pos, vel } = view.shuttle;
    shuttle.position.set(pos.x, pos.y, pos.z);
    dir.set(vel.x, vel.y, vel.z);
    if (dir.lengthSq() > 1e-6) shuttle.quaternion.setFromUnitVectors(up, dir.normalize());
    shadow.position.set(pos.x, 0.012, pos.z);
    shadow.scale.set(0.12 + 0.02 * pos.y, 1, 0.07 + 0.012 * pos.y);

    landing.visible = view.landing !== null;
    if (view.landing) landing.position.set(view.landing.x, 0.02, view.landing.z);

    timing.visible = view.timingRing !== null && !!near;
    if (view.timingRing !== null && near) {
      timing.position.set(near.pos.x, 0.02, near.pos.z);
      timing.scale.setScalar(1 + (1 - view.timingRing) * 1.5); // closes in as contact nears perfect
      (timing.material as THREE.MeshBasicMaterial).color.setHex(view.timingRing > 0.85 ? 0x39ff6a : 0xffffff);
    }

    const c = view.charge;
    chargeArc.visible = c !== null && c > 0 && !!near;
    if (c !== null && c > 0 && near) {
      chargeArc.position.set(near.pos.x, 0.02, near.pos.z);
      if (Math.abs(c - chargeShown) > 0.005) {
        chargeArc.geometry.dispose();
        chargeArc.geometry = flat(new THREE.RingGeometry(0.9, 0.98, 48, 1, 0, Math.PI * 2 * Math.min(c, 1)));
        chargeShown = c;
      }
    }

    renderer.render(scene, camera);
  }

  function dispose() {
    window.removeEventListener('resize', resize);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.geometry.dispose(); [m.material].flat().forEach((x) => x.dispose()); }
    });
    renderer.dispose();
    renderer.domElement.remove();
  }

  return { render, resize, dispose };
}
