// main.js — standard WebGLRenderer version (no three-gpu-pathtracer)

import {
    WebGLRenderer,
    ACESFilmicToneMapping,
    PerspectiveCamera,
    Scene,
    Mesh,
    MeshPhysicalMaterial,
    BoxGeometry,
    Color,
    EquirectangularReflectionMapping,
    SRGBColorSpace,
    PMREMGenerator,
    SpotLight,
    PCFSoftShadowMap
} from "three";

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { GUI } from "three/examples/jsm/libs/lil-gui.module.min.js";

import TorusScene from "./scene.js";

// 1) Import the EXR as a URL via Vite’s asset pipeline
// import envURL from "../../assets/env/afternoon1k.hdr";
import envURL from '../../assets/env/afternoon1k.hdr?url';
import {HDRLoader} from "three/addons";

// ------------------------
// Scene & objects
// ------------------------
const scene = new Scene();

const torus = new TorusScene();
torus.position.set(0, 1, 0);
scene.add(torus);

// // Ground
// const ground = new Mesh(
//     new BoxGeometry(20, 0.1, 10),
//     new MeshPhysicalMaterial({
//         color: 0xffffff,
//         clearcoat: 1,
//         roughness: 0.5,
//         metalness: 0,
//     })
// );
// ground.receiveShadow = true;
// ground.position.set(0, -1, 0);
// scene.add(ground);
//
// // Back wall
// const backWall = new Mesh(
//     new BoxGeometry(20, 8, 0.1),
//     new MeshPhysicalMaterial({})
// );
// backWall.receiveShadow = true;
// backWall.position.set(0, 1, -5);
// scene.add(backWall);

// ------------------------
// Camera
// ------------------------
const camera = new PerspectiveCamera(60, 1, 0.1, 1000);
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

// ------------------------
// Renderer
// ------------------------
const renderer = new WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true, // for PNG saves
});
renderer.toneMapping = ACESFilmicToneMapping;
renderer.outputColorSpace = SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap; // optional, nicer shadows
document.body.appendChild(renderer.domElement);

// ------------------------
// Lighting (standard)
// ------------------------
const spotLight = new SpotLight(0xffffff, 2.0);
spotLight.position.set(2, 10.0, 10);
spotLight.angle = Math.PI / 2;
spotLight.decay = 0;     // physically-correct lights normally use decay>0; keep 0 to mimic your settings
spotLight.distance = 0.0;
spotLight.castShadow = true;

// shadow settings
spotLight.shadow.mapSize.width = 512;
spotLight.shadow.mapSize.height = 512;
spotLight.shadow.camera.near = 0.1;
spotLight.shadow.camera.far = 50.0;
spotLight.shadow.focus = 1.0;

scene.add(spotLight);

// Light target
spotLight.target.position.set(1, 0, 1.05);
scene.add(spotLight.target);

// // Make torus & backWall cast shadows if desired
// torus.traverse(obj => {
//     if (obj.isMesh) {
//         obj.castShadow = true;
//         obj.receiveShadow = false;
//     }
// });
// backWall.castShadow = false;

// ------------------------
// Environment (EXR via PMREM)
// ------------------------
const pmrem = new PMREMGenerator(renderer);
pmrem.compileEquirectangularShader();

new HDRLoader().loadAsync(envURL).then((exrTex) => {
    // For EXR: leave colorSpace in its default linear; no need to set SRGB on the texture.
    // Create a filtered env map for PBR materials:
    const envMap = pmrem.fromEquirectangular(exrTex).texture;

    scene.environment = envMap;

    // If you want the visible background to be the raw EXR, use:
     exrTex.mapping = EquirectangularReflectionMapping;
     scene.background = exrTex;
     scene.backgroundBlurriness=0.;
    //
    // Or keep a neutral background:
   // scene.background = new Color(0x000000);

   // exrTex.dispose();
});

// ------------------------
// Controls
// ------------------------
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.33, -0.08);
controls.update();

// ------------------------
// GUI (save PNG)
// ------------------------
function saveImage(canvas) {
    const date = new Date();
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const hour = date.getHours();
    const minute = date.getMinutes();
    const link = document.createElement("a");
    link.download = `render ${month}-${day}-${hour}${minute}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
}

const gui = new GUI().close();
torus.addToUI(gui);
gui.add({ save: () => saveImage(renderer.domElement) }, "save");

// ------------------------
// Resize & animate
// ------------------------
function onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
window.addEventListener("resize", onResize);
onResize();

function animate() {
    requestAnimationFrame(animate);
    // If TorusScene animates internally, call its update here as needed:
    // torus.update?.(performance.now() / 1000);

    renderer.render(scene, camera);
}
animate();
