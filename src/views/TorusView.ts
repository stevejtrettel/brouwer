/**
 * TorusView — a self-contained solid-torus scene a demo can drop onto the
 * screen. It assembles the shell, core, meridian fiber, one graph tube per
 * curve, a pulsing collision-marker pool, an optional steady-landmark pool,
 * the camera, and orbit controls (gated to this viewport).
 *
 * It is a VIEW, not a framework: the demo owns the curves and its own refresh
 * loop, then calls the returned handles — refit() after refilling curves,
 * placeMarkers() for collisions, setMeridianTheta() for the fiber, and drives
 * the exposed landmark/marker pools directly when it wants finer control.
 */

import { PerspectiveCamera, Scene } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import type { App } from "../app/App.ts";
import type { ViewRect, Viewport } from "../app/ViewManager.ts";
import type { SolidTorus } from "../math/torus.ts";
import type { GraphCurve, Vec3 } from "../math/types.ts";
import { vec3 } from "../math/types.ts";

import { attachOrbitGate } from "./orbitGate.ts";
import { addCartoonLights } from "../components/theme.ts";
import { TorusShell } from "../components/TorusShell.ts";
import { CoreCurve } from "../components/CoreCurve.ts";
import { GraphTube } from "../components/GraphTube.ts";
import { MeridianDisk } from "../components/MeridianDisk.ts";
import { Marker } from "../components/Marker.ts";

/** A point on a graph curve where a collision is marked. */
export interface TorusMarkerEvent {
    theta: number;
    x: number;
    y: number;
}

export interface TorusViewOptions {
    app: App;
    torus: SolidTorus;
    /** drawn as tubes, in order; the demo owns and refills them */
    curves: GraphCurve[];
    rect: ViewRect;
    /** pulsing collision markers (default 8) */
    markers?: number;
    /** steady fixed-point/landmark dots (default 0) */
    landmarks?: number;
    /** perspective camera position (default [0, 4.6, 7.4], looking at origin) */
    cameraPos?: [number, number, number];
    /** show the translucent meridian fiber disk (default true) */
    meridian?: boolean;
    name?: string;
}

export interface TorusView {
    readonly scene: Scene;
    readonly viewport: Viewport;
    readonly camera: PerspectiveCamera;
    readonly controls: OrbitControls;
    readonly tubes: GraphTube[];
    /** the core curve S¹ × {0} — figures may thin it (`core.radius`) or
     *  hide it (`core.visible`) when it isn't part of the argument */
    readonly core: CoreCurve;
    /** the fiber disk, or null when `meridian: false` */
    readonly meridian: MeridianDisk | null;
    /** gold pulsing collision markers */
    readonly markers: Marker[];
    /** steady landmark dots (empty unless `landmarks` was requested) */
    readonly landmarks: Marker[];
    /** re-embed the tubes after the demo has refilled its curves */
    refit(): void;
    /** show one marker per event (embedded to the torus), hide the rest */
    placeMarkers(events: TorusMarkerEvent[]): void;
    /** rotate the meridian fiber disk */
    setMeridianTheta(theta: number): void;
    /** torus.embed passthrough, for positioning landmarks in demo code */
    embed(theta: number, x: number, y: number, out?: Vec3): Vec3;
}

export function createTorusView(options: TorusViewOptions): TorusView {
    const { app, torus, curves, rect } = options;
    const name = options.name ?? "torus";

    const scene = new Scene();
    addCartoonLights(scene);
    app.applyEnvironment(scene);
    const core = new CoreCurve(torus);
    scene.add(new TorusShell(torus), core);

    const meridian = options.meridian === false ? null : new MeridianDisk(torus);
    if (meridian) scene.add(meridian);

    const tubes = curves.map((curve) => {
        const tube = new GraphTube({ curve, torus });
        scene.add(tube);
        return tube;
    });

    const markers = Array.from({ length: options.markers ?? 8 }, () => {
        const m = new Marker();
        scene.add(m);
        return m;
    });
    app.addAnimateCallback((time) => markers.forEach((m) => m.animate(time)));

    const landmarks = Array.from({ length: options.landmarks ?? 0 }, () => {
        const dot = new Marker(0.055);
        scene.add(dot);
        return dot;
    });

    const [cx, cy, cz] = options.cameraPos ?? [0, 4.6, 7.4];
    const camera = new PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(cx, cy, cz);
    camera.lookAt(0, 0, 0);
    const viewport = app.views.add({ name, scene, camera, rect });

    const controls = new OrbitControls(camera, app.renderer.domElement);
    controls.enableDamping = true;
    app.addAnimateCallback(() => controls.update());
    // orbit only when the pointer is over THIS viewport
    attachOrbitGate({ canvas: app.renderer.domElement, views: app.views, name, controls });

    const scratch = vec3();

    return {
        scene,
        viewport,
        camera,
        controls,
        tubes,
        core,
        meridian,
        markers,
        landmarks,
        refit() {
            for (const tube of tubes) tube.refit();
        },
        placeMarkers(events) {
            for (let i = 0; i < markers.length; i++) {
                const marker = markers[i]!;
                const event = events[i];
                if (!event) {
                    marker.visible = false;
                    continue;
                }
                marker.visible = true;
                torus.embed(event.theta, event.x, event.y, scratch);
                marker.position.set(scratch.x, scratch.y, scratch.z);
            }
        },
        setMeridianTheta(theta) {
            if (meridian) meridian.theta = theta;
        },
        embed(theta, x, y, out = vec3()) {
            return torus.embed(theta, x, y, out);
        },
    };
}
