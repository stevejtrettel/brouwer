/**
 * SphereView — a self-contained domain-sphere panel a demo can drop onto the
 * screen: perspective viewport with orbit controls gated to its rect, the
 * translucent graticuled sphere, the current-slice LatitudeRing, a pulsing
 * event-marker pool, and a steady dot pool (slice points, field zeros).
 *
 * It is a VIEW, not a framework: the demo owns φ and drives setPhi, feeds
 * placeMarkers/setDots with math-layer (z-up) positions, and adds its own
 * extras (TangentArrows, FrameGizmo) straight into `scene`.
 */

import { Color, PerspectiveCamera, Scene, Vector3 } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { App } from "../app/App.ts";
import type { ViewRect, Viewport } from "../app/ViewManager.ts";
import type { Vec3 } from "../math/types.ts";

import { addCartoonLights, theme } from "../components/theme.ts";
import { mathToWorld } from "../components/arrows.ts";
import { SphereSurface } from "../components/SphereSurface.ts";
import { LatitudeRing } from "../components/LatitudeRing.ts";
import { Marker } from "../components/Marker.ts";

/** One entry for the steady dot pool, in math (z-up) sphere coordinates. */
export interface SphereDotSpec {
    p: Vec3;
    color: number;
    visible?: boolean;
}

export interface SphereViewOptions {
    app: App;
    rect: ViewRect;
    /** pulsing event markers (default 4) */
    markers?: number;
    /** steady dots — slice points, field zeros (default 0) */
    dots?: number;
    /** perspective camera position (default [2.1, 1.5, 2.7], looking at origin) */
    cameraPos?: [number, number, number];
    name?: string;
}

export interface SphereView {
    readonly scene: Scene;
    readonly viewport: Viewport;
    readonly camera: PerspectiveCamera;
    readonly controls: OrbitControls;
    readonly latitude: LatitudeRing;
    readonly markers: Marker[];
    readonly dots: Marker[];
    /** move the slice ring to polar angle φ */
    setPhi(phi: number): void;
    /** extra condition ANDed into the pointer-over-viewport orbit enable —
     *  e.g. () => !combMode, so a brush can own the drag */
    setOrbitGate(gate: () => boolean): void;
    /** show one pulsing marker per position (math coords), hide the rest */
    placeMarkers(positions: Vec3[]): void;
    /** show one steady dot per spec, hide the rest */
    setDots(specs: SphereDotSpec[]): void;
}

const MARKER_LIFT = 1.02; // markers ride just above the surface

export function createSphereView(options: SphereViewOptions): SphereView {
    const { app, rect } = options;
    const name = options.name ?? "sphere";

    const scene = new Scene();
    addCartoonLights(scene);
    app.applyEnvironment(scene);
    scene.background = new Color(theme.sliceBackground); // domain panels are the cooler tint

    const surface = new SphereSurface();
    const latitude = new LatitudeRing();
    scene.add(surface, latitude);

    const markers = Array.from({ length: options.markers ?? 4 }, () => {
        const m = new Marker(0.075);
        scene.add(m);
        return m;
    });
    app.addAnimateCallback((time) => markers.forEach((m) => m.animate(time)));

    const dots = Array.from({ length: options.dots ?? 0 }, () => {
        const dot = new Marker(0.045);
        scene.add(dot);
        return dot;
    });

    const [cx, cy, cz] = options.cameraPos ?? [2.1, 1.5, 2.7];
    const camera = new PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(cx, cy, cz);
    camera.lookAt(0, 0, 0);
    const viewport = app.views.add({ name, scene, camera, rect });

    const controls = new OrbitControls(camera, app.renderer.domElement);
    controls.enableDamping = true;
    app.addAnimateCallback(() => controls.update());
    // orbit only when the pointer is over THIS viewport (and the demo's
    // gate — e.g. comb mode — allows it)
    let orbitGate: () => boolean = () => true;
    app.renderer.domElement.addEventListener("pointermove", (e) => {
        const vp = app.views.viewportAt(e.clientX, e.clientY, window.innerWidth, window.innerHeight);
        controls.enabled = vp?.name === name && orbitGate();
    });

    const world = new Vector3();

    function placeAt(marker: Marker, p: Vec3): void {
        mathToWorld(p, world).multiplyScalar(MARKER_LIFT);
        marker.position.copy(world);
    }

    return {
        scene,
        viewport,
        camera,
        controls,
        latitude,
        markers,
        dots,
        setPhi(phi) {
            latitude.setPhi(phi);
        },
        setOrbitGate(gate) {
            orbitGate = gate;
        },
        placeMarkers(positions) {
            for (let i = 0; i < markers.length; i++) {
                const marker = markers[i]!;
                const p = positions[i];
                marker.visible = Boolean(p);
                if (p) placeAt(marker, p);
            }
        },
        setDots(specs) {
            for (let i = 0; i < dots.length; i++) {
                const dot = dots[i]!;
                const spec = specs[i];
                dot.visible = Boolean(spec) && spec!.visible !== false;
                if (spec) {
                    dot.setColor(spec.color);
                    placeAt(dot, spec.p);
                }
            }
        },
    };
}
