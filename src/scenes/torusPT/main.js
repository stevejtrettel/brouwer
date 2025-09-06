import {
    WebGLRenderer,
    ACESFilmicToneMapping,
    PerspectiveCamera,
    Color,
    Scene,
    Mesh,
    MeshPhysicalMaterial,
    Vector2,
    BoxGeometry, TorusKnotGeometry,
    TorusGeometry, TubeGeometry, CylinderGeometry,
    Vector3, Group, SphereGeometry, FloatType, DoubleSide, CatmullRomCurve3, LineCurve3,
} from "three";

import { EXRLoader } from "three/examples/jsm/loaders/EXRLoader.js";
import { RGBELoader } from "three/examples/jsm/loaders/RGBELoader.js";
import { EquirectangularReflectionMapping, SRGBColorSpace } from "three";

import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import {
    GradientEquirectTexture,
    WebGLPathTracer,
    ShapedAreaLight, PhysicalSpotLight,PhysicalCamera,
} from 'three-gpu-pathtracer';

import {GUI} from "three/examples/jsm/libs/lil-gui.module.min.js";

import TorusScene from "./scene.js";

// 1) Import the EXR as a URL via Vite’s asset pipeline  <<<< LINE 1
import envURL from "../../assets/env/studio.exr"


// init scene and objects, and lights
//--------------------------------------------

const scene = new Scene();


const torus = new TorusScene();
torus.position.set(0,1,0);
scene.add(torus);







// spot light
let spotLight = new PhysicalSpotLight( 0xffffff );
spotLight.position.set( 2, 10.0, 10 );
spotLight.angle = Math.PI / 2;
spotLight.decay = 0;
spotLight.penumbra = 1.0;
spotLight.distance = 0.0;
spotLight.intensity = 2.0;
spotLight.radius = 0.5;

// spot light shadow
spotLight.shadow.mapSize.width = 512;
spotLight.shadow.mapSize.height = 512;
spotLight.shadow.camera.near = 0.1;
spotLight.shadow.camera.far = 10.0;
spotLight.shadow.focus = 1.0;
spotLight.castShadow = true;
scene.add( spotLight );

// spot light target
const targetObject = spotLight.target;
targetObject.position.x = 1;
targetObject.position.y = 0;
targetObject.position.z = 1.05;
scene.add( targetObject );









const ground = new Mesh(
    new BoxGeometry( 20, 0.1, 10 ),
    new MeshPhysicalMaterial({
        color:0xffffff, clearcoat:1, roughness:0.5,metalness:0
    }),
);
ground.position.set(0.,-1,0);
scene.add(ground);

const backWall = new Mesh(
    new BoxGeometry( 20, 8, 0.1 ),
    new MeshPhysicalMaterial({
    }),
);
backWall.position.set(0,1,-5);
scene.add(backWall);




// camera
//--------------------------------------------
const camera = new PerspectiveCamera();
camera.position.set( 0, 5, 10 );
camera.lookAt( 0, 0, 0 );


// const camera = new PhysicalCamera( 60, window.innerWidth / window.innerHeight, 0.025, 500 );
//  camera.position.set( 0, 10, -20 );
//  camera.lookAt(0,0,0);
// camera.apertureBlades = 0;
// camera.fStop = 0.2;
// camera.fov = 20;
//
// camera.focusDistance = 1.1878;
// let focusPoint = new Vector3();
// focusPoint.set( 0,0,-3 );



// set up the renderer
//--------------------------------------------
let renderer = new WebGLRenderer({
    preserveDrawingBuffer:true,
});
renderer.toneMapping = ACESFilmicToneMapping;
renderer.outputColorSpace = SRGBColorSpace; // proper color output
document.body.appendChild( renderer.domElement );



// set up the Path tracer
//--------------------------------------------
let pathTracer = new WebGLPathTracer( renderer );
pathTracer.setScene( scene, camera );

pathTracer.renderScale = Math.max( 1 / window.devicePixelRatio, 0.5 );;
pathTracer.tiles.setScalar( 3 );
pathTracer.bounces = 30.;



//environ


// new RGBELoader().loadAsync(envURL).then(tex => {
//     tex.mapping = EquirectangularReflectionMapping;
//     scene.environment = tex;
//     scene.background = tex;
//     scene.environmentIntensity = 1;
//     pathTracer.updateEnvironment();
//     pathTracer.reset();
// });


new EXRLoader().loadAsync(envURL).then(tex => {
    tex.mapping = EquirectangularReflectionMapping;
    scene.environment = tex;
    scene.background = tex;  // or null if you don’t want the sky visible
    scene.environmentIntensity = 2;  // tune to taste
    pathTracer.updateEnvironment();
    pathTracer.reset();
});



// SCREENSHOTS
//---------------------------------------------------

function saveImage(canvas){
    const date = new Date();
    let day = date.getDate();
    let month = date.getMonth() + 1;
    let hour = date.getHours();
    let minute = date.getMinutes();

    let link = document.createElement('a');
    link.download = `pathtrace ${month}-${day}-${hour}${minute}`+'.png';
    link.href = canvas.toDataURL("image/png");
    //.replace("image/png", "image/octet-stream");
    link.click();
}


const gui = new GUI().close();
let params = {
    saveit: ()=>saveImage(renderer.domElement),
};
gui.add( params, 'saveit' );



//controls
//--------------------------------------------
let controls = new OrbitControls( camera, renderer.domElement );
controls.target.set( 0, 0.33, - 0.08 );
controls.addEventListener( 'change', () => {
   //for physical camera: if we have autofocus
  //  camera.focusDistance = camera.position.distanceTo( focusPoint ) - camera.near;
    pathTracer.updateCamera();
} );
controls.update();
// controls.addEventListener( 'change', () => {
//     camera.focusDistance = camera.position.distanceTo( focusPoint ) - camera.near;
//     pathTracer.updateCamera();
// } );




//animate loop
//--------------------------------------------


onResize();

animate();

window.addEventListener( 'resize', onResize );

function animate() {


    // if the camera position changes call "ptRenderer.reset()"
    requestAnimationFrame( animate );

    // update the camera and render one sample
    pathTracer.renderSample();

}

function onResize() {

    // update rendering resolution
    const w = window.innerWidth;
    const h = window.innerHeight;

    renderer.setSize( w, h );
    renderer.setPixelRatio( window.devicePixelRatio );

    const aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();

    pathTracer.setScene( scene, camera );

}

