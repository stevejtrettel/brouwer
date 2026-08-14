/**
 * Brouwer — FIGURE PAGE. Five configurations as tabs: the three panels of
 * Figure 3 (unlinked → the crossing → linked) and the two of Figure 4 (the
 * push to the core, and the disk the core bounds).
 *
 * The workbench owns the layout; this file says what each configuration is and
 * what of its state is worth saving.
 */

import { buildBrouwerScene } from "../brouwer/scene.ts";
import { loadCrumple } from "../../src/math/maps/crumple.ts";
import { attachFigureMode } from "../../src/app/FigureRenderer.ts";
import { attachWorkbench } from "../../src/app/FigureWorkbench.ts";
import type { FigureConfig } from "../../src/app/FigureWorkbench.ts";
import { applyPose, TORUS_THREE_QUARTER, TORUS_WITH_PLATE } from "../../src/app/figurePose.ts";
import { slider, toggle, readout } from "../../src/ui/controls.ts";

const scene = buildBrouwerScene({ mode: "render" });
(window as unknown as Record<string, unknown>).__scene = scene; // staging handle

// the scene owns θ but does not report it back; the page is what persists it
let sliceTheta = 5.1;

// ------------------------------------------------------------------ controls
const rSlider = slider({
    label: "radius r",
    min: 0.02,
    max: 1,
    step: 0.002,
    value: scene.state.r,
    onInput: (r) => scene.setR(r),
});
const thetaSlider = slider({
    label: "slice θ",
    min: 0,
    max: 2 * Math.PI,
    step: Math.PI / 200,
    value: sliceTheta,
    onInput: (theta) => {
        sliceTheta = theta;
        scene.slice?.setTheta(theta);
    },
});
const sliceToggle = toggle({
    label: "slice reference",
    value: false,
    onChange: (on) => scene.slice?.show(on),
});
const coreToggle = toggle({
    label: "core curve",
    value: true,
    onChange: (on) => {
        scene.torusView.core.visible = on;
    },
});
const surfaceToggle = toggle({
    label: "push surface",
    value: false,
    onChange: (on) => scene.setPushSurface(on),
});
const status = readout({ label: "" });
scene.hooks.afterRefresh = (s) => status.set(s.status);
scene.refresh();

const setSlice = (on: boolean): void => {
    scene.slice?.show(on);
    sliceToggle.set(on);
};
const setCore = (on: boolean): void => {
    scene.torusView.core.visible = on;
    coreToggle.set(on);
};
const setSurface = (on: boolean): void => {
    scene.setPushSurface(on);
    surfaceToggle.set(on);
};

// ------------------------------------------------------------------ figures
let current: FigureConfig | undefined;
const size = (): { width: number; height: number } => {
    const [w, h] = (current?.size ?? "1440x900").split("x").map(Number);
    return { width: w || 1440, height: h || 900 };
};

const figure = attachFigureMode({
    app: scene.app,
    view: scene.torusView,
    name: "brouwer",
    frameSize: size,
    urlState: () => ({ r: scene.state.r.toFixed(3) }),
});

const capture = (): Record<string, unknown> => ({
    r: scene.state.r,
    theta: sliceTheta,
    slice: sliceToggle.value,
    core: coreToggle.value,
    surface: surfaceToggle.value,
});
const restore = (state: Record<string, unknown>): void => {
    if (typeof state.r === "number") {
        scene.setR(state.r);
        rSlider.set(state.r);
    }
    if (typeof state.theta === "number") {
        sliceTheta = state.theta;
        scene.slice?.setTheta(state.theta);
        thetaSlider.set(state.theta);
    }
    if (typeof state.core === "boolean") setCore(state.core);
    if (typeof state.surface === "boolean") setSurface(state.surface);
    if (typeof state.slice === "boolean") setSlice(state.slice);
};

/** everything the r-family panels share; only the radius differs */
const plain = (id: string, label: string, title: string, r: number): FigureConfig => ({
    id,
    label,
    title,
    figure,
    view: scene.torusView,
    apply: () => {
        applyPose(scene.torusView, TORUS_THREE_QUARTER);
        scene.setSpanningDisk(false);
        setCore(false);
        setSurface(false);
        setSlice(false);
        scene.setR(r); // setR cancels any baked deformation
        rSlider.set(r);
    },
    capture,
    restore,
});

const configs: FigureConfig[] = [
    // r = 0.02, not 0.3: the panel's claim is that near the centre the two
    // curves are OBVIOUSLY separable, and that only reads at the very smallest
    // radius, where Γ_i has collapsed onto the core and Γ_f sits out at f(0).
    plain("small-r", "3(a) unlinked", "Figure 3(a) — small r: two circles you can pull apart", 0.02),
    {
        id: "crossing",
        label: "crossing",
        title: "Figure 3(b) — the r where the graphs meet: a fixed point",
        figure,
        view: scene.torusView,
        apply: () => {
            // The same pose and the same object as (a) and (c): three views of
            // one torus with only r changing. The slice plate was scaffolding
            // for finding the crossing, and a third panel that suddenly gains
            // an extra object reads as a different picture.
            applyPose(scene.torusView, TORUS_THREE_QUARTER);
            scene.setSpanningDisk(false);
            setCore(false);
            setSurface(false);
            setSlice(false);
            const r = scene.snapToFixedPoint();
            if (r !== null) rSlider.set(r);
        },
        capture,
        restore,
    },
    plain("r-1", "3(c) linked", "Figure 3(c) — r = 1: threaded through each other", 1),
    {
        id: "push-core-ghosts",
        label: "push",
        title: "Figure 4(a) — pushing Γ_{f₁} onto the core",
        figure,
        view: scene.torusView,
        apply: () => {
            applyPose(scene.torusView, TORUS_WITH_PLATE);
            scene.setSpanningDisk(false);
            setCore(true);
            scene.setR(1);
            rSlider.set(1);
            setSurface(true);
            setSlice(true);
        },
        capture,
        restore,
    },
    {
        id: "linking-disk",
        label: "linking disk",
        title: "Figure 4(b) — the core bounds a disk, pierced once",
        figure,
        view: scene.torusView,
        apply: () => {
            applyPose(scene.torusView, { position: [0, 3.1, 8.4], target: [0, -0.1, 0] });
            setSurface(false);
            setSlice(false);
            scene.setSpanningDisk(true);
            rSlider.set(1);
        },
        capture,
        restore,
    },
];

attachWorkbench({
    app: scene.app,
    page: "brouwer-render",
    title: "Brouwer",
    configs,
    controls: [rSlider, thetaSlider, sliceToggle, coreToggle, surfaceToggle, status],
    onSelect: (config) => {
        current = config;
    },
});

// ---------------------------------------------------------------- the map
//
// Figure 3's map is a choice, not a default: the scripted bake happens to put
// its fixed point at r = 1, on the boundary, where the whole unlinked→linked
// sweep resolves in the last instant. So the page prefers a hand-folded map
// saved from /d/crumple/, and falls back to the bake when there isn't one.
//
//   crumples/brouwer.json          used automatically
//   ?crumple=<name>                use a different one (trying maps out)
{
    const name = new URLSearchParams(location.search).get("crumple") ?? "brouwer";
    void loadCrumple(name, scene.grid)
        .then((crumple) => {
            if (crumple) scene.applyCrumple(crumple);
        })
        .catch((error: unknown) => console.warn(`crumple "${name}" not applied:`, error));
}
