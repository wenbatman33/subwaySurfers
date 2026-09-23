// DEV：角色檢視器（img2threejs 審查截圖用），支援視角 / 動作 / 角色切換、滑鼠拖曳旋轉
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Humanoid, Dog, makeHoverboard } from '../src/characters.js';
import { installBend } from '../src/bend.js';

installBend();
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#eaf8f6');
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;
const cam = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 0.1, 100);
const controls = new OrbitControls(cam, renderer.domElement);
controls.target.set(0, 1.05, 0);
// 光：主光（前左上）+ 半球補光 + 背後邊光
scene.add(new THREE.HemisphereLight('#eaf8ff', '#d8e4ea', 1.2));
const key = new THREE.DirectionalLight('#fff4e6', 2.6);
key.position.set(-3, 5, -4);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.bias = -0.0005;
scene.add(key);
const rim = new THREE.DirectionalLight('#ffffff', 0.8);
rim.position.set(2, 4, 5);
scene.add(rim);
const ground = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.ShadowMaterial({ opacity: 0.18 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const kid = new Humanoid({});
const guard = new Humanoid({ guard: true });
const dog = new Dog();
const board = makeHoverboard();
board.position.set(0, 0.12, 0);
guard.root.position.set(1.6, 0, 0.6);
dog.root.position.set(-1.3, 0, 0.4);
scene.add(kid.root, guard.root, dog.root);

const params = new URLSearchParams(location.search);
let view = params.get('view') || 'front';
let anim = params.get('anim') || 'idle';
let show = params.get('char') || 'kid';
function setView(v) {
  view = v;
  const t = controls.target;
  const d = show === 'all' ? 7.5 : show === 'dog' ? 3 : 5.2;
  const ty = show === 'dog' ? 0.5 : 1.05;
  const cx = show === 'guard' ? 1.6 : show === 'dog' ? -1.3 : 0;
  t.set(cx, ty, show === 'all' ? 0.3 : 0);
  // 角色面向 -Z：正面相機在 -Z 側
  const dir = v === 'front' ? new THREE.Vector3(-0.45, 0.12, -1) : v === 'side' ? new THREE.Vector3(-1, 0.1, 0) : new THREE.Vector3(0.3, 0.15, 1);
  cam.position.copy(t).addScaledVector(dir.normalize(), d);
  controls.update();
}
function setShow(c) {
  show = c;
  kid.root.visible = c === 'kid' || c === 'all';
  guard.root.visible = c === 'guard' || c === 'all';
  dog.root.visible = c === 'dog' || c === 'all';
  setView(view);
}
document.getElementById('ui').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.v) setView(b.dataset.v);
  if (b.dataset.a) anim = b.dataset.a;
  if (b.dataset.c) setShow(b.dataset.c);
});
setShow(show);

let t = 0, last = performance.now();
renderer.setAnimationLoop((now) => {
  if (renderer.domElement.width !== Math.floor(innerWidth * renderer.getPixelRatio())) { cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  for (const h of [kid, guard]) {
    const pose = anim === 'run' ? h.runPose(t * 12) : { shZL: -0.35, shZR: 0.35, elL: 0.25, elR: 0.25, headX: Math.sin(t * 1.5) * 0.04, rigY: 0.95 };
    h.apply(pose, dt);
  }
  dog.animate(t, anim === 'run');
  renderer.render(scene, cam);
});
addEventListener('resize', () => {
  cam.aspect = innerWidth / innerHeight;
  cam.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
window.__review = { kid, guard, dog, setView, setShow, scene };
