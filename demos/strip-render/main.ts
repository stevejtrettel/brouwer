/**
 * The paper strip — FIGURE PAGE.
 *
 * A strip closed into a ring with n full twists, and its two edge curves. No
 * map, no sphere, no torus: §3 reduces Borsuk–Ulam to a fact about paper, and
 * this is the figure of that fact. Twist the strip an odd number of times and
 * the two edges cannot be pulled apart; twist it an even number and they come
 * away freely.
 *
 * Its own page rather than a preset on borsuk-render, because it shares no
 * scene with anything — the Borsuk page's actors are a sphere, a torus and a
 * map, and none of them appear here.
 */

import { Color, PerspectiveCamera, Scene } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import { App } from "../../src/app/App.ts";
import { attachFigureMode } from "../../src/app/FigureRenderer.ts";
import { attachWorkbench } from "../../src/app/FigureWorkbench.ts";
import type { FigureConfig } from "../../src/app/FigureWorkbench.ts";
import { applyPose } from "../../src/app/figurePose.ts";
import { TwistedBand } from "../../src/components/TwistedBand.ts";
import { theme, addCartoonLights } from "../../src/components/theme.ts";
import { slider } from "../../src/ui/controls.ts";

const app = new App();

const scene = new Scene();
scene.background = new Color(theme.background);
addCartoonLights(scene);

const band = new TwistedBand({ twists: 1, radius: 1, halfWidth: 0.26 });
scene.add(band);

const camera = new PerspectiveCamera(40, 1, 0.1, 100);
camera.position.set(0, 2.4, 3.4);
const controls = new OrbitControls(camera, app.renderer.domElement);
controls.enableDamping = true;
app.addAnimateCallback(() => controls.update());

const viewport = app.views.add({ name: "strip", scene, camera, rect: { x: 0, y: 0, w: 1, h: 1 } });
const view = { scene, viewport, camera, controls };

let twists = 1;
const twistSlider = slider({
    label: "full twists",
    min: 0,
    max: 4,
    step: 1,
    value: twists,
    onInput: (n) => {
        twists = n;
        band.setTwists(n);
    },
});

const figure = attachFigureMode({
    app,
    view,
    name: "strip",
    frameSize: () => ({ width: 1400, height: 900 }),
});

const capture = (): Record<string, unknown> => ({ twists });
const restore = (state: Record<string, unknown>): void => {
    if (typeof state.twists === "number") {
        twists = state.twists;
        band.setTwists(twists);
        twistSlider.set(twists);
    }
};

const at = (n: number, id: string, label: string, title: string): FigureConfig => ({
    id,
    label,
    title,
    figure,
    view,
    size: "1400x900",
    apply: () => {
        twists = n;
        band.setTwists(n);
        twistSlider.set(n);
        applyPose(view, { position: [0, 2.4, 3.4], target: [0, 0, 0] });
    },
    capture,
    restore,
});

attachWorkbench({
    app,
    page: "strip-render",
    title: "The paper strip",
    configs: [
        at(0, "strip-untwisted", "no twist", "Untwisted: the edges come apart"),
        at(1, "strip-twisted", "one full twist", "One full twist: the edges are linked"),
    ],
    controls: [twistSlider],
});

app.views.resize(window.innerWidth, window.innerHeight);
window.addEventListener("resize", () => app.views.resize(window.innerWidth, window.innerHeight));
app.start();
