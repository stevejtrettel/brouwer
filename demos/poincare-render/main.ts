/**
 * Poincaré — FIGURE PAGE. Six configurations as tabs, spanning three figures:
 * the construction of f_γ (Figure 7), the loop and its reverse on the sphere
 * (Figure 8), and the three graphs in the torus (Figure 9).
 *
 * Everything is driven by the ONE deformation parameter s (γ → γ̄): s = 0 is
 * the small north loop, s = 1 is the same loop reversed, and the crossing is
 * somewhere in between.
 */

import { buildPoincareScene } from "../poincare/scene.ts";
import { attachFigureMode } from "../../src/app/FigureRenderer.ts";
import { attachWorkbench } from "../../src/app/FigureWorkbench.ts";
import type { FigureConfig } from "../../src/app/FigureWorkbench.ts";
import { applyPose, SPHERE_STANDARD, TORUS_THREE_QUARTER } from "../../src/app/figurePose.ts";
import { slider, readout } from "../../src/ui/controls.ts";

const scene = buildPoincareScene({ mode: "render", meridian: false, thetaProbe: false });

// ------------------------------------------------------------------ controls
let s = 0;
const sSlider = slider({
    label: "γ → γ̄  s",
    min: 0,
    max: 1,
    step: 0.002,
    value: 0,
    onInput: (v) => {
        s = v;
        scene.setHomotopy(v);
    },
});
const status = readout({ label: "" });
scene.hooks.afterRefresh = (r) => status.set(r.status);
scene.refresh();

const setS = (v: number): void => {
    s = v;
    scene.setHomotopy(v);
    sSlider.set(v);
};

// ------------------------------------------------------------------ figures
let current: FigureConfig | undefined;
const size = (): { width: number; height: number } => {
    const [w, h] = (current?.size ?? "1440x900").split("x").map(Number);
    return { width: w || 1440, height: h || 900 };
};

const torusFigure = attachFigureMode({
    app: scene.app,
    view: scene.torusView,
    name: "poincare",
    frameSize: size,
    urlState: () => ({ phi: scene.state.phi.toFixed(3) }),
});
const sphereFigure = attachFigureMode({
    app: scene.app,
    view: scene.sphere,
    name: "poincare-sphere",
    groundY: -1.05,
    frameSize: size,
    urlState: () => ({ phi: scene.state.phi.toFixed(3) }),
});

const capture = (): Record<string, unknown> => ({ s });
const restore = (state: Record<string, unknown>): void => {
    if (typeof state.s === "number") setS(state.s);
};

const graph = (id: string, label: string, title: string, at: number): FigureConfig => ({
    id,
    label,
    title,
    figure: torusFigure,
    view: scene.torusView,
    apply: () => {
        applyPose(scene.torusView, TORUS_THREE_QUARTER);
        scene.setFramePlate(false);
        setS(at);
    },
    capture,
    restore,
});

const configs: FigureConfig[] = [
    {
        id: "frame",
        label: "construction",
        title: "Figure 7 — laying the tangent plane on the disk",
        figure: sphereFigure,
        view: scene.sphere,
        size: "1560x860",
        apply: () => {
            applyPose(scene.sphere, { position: [1.6, 1.15, 3.5], target: [0.6, 0.02, 0] });
            setS(scene.sForPhi(0.75));
            // θ chosen so γ(θ) faces the camera: world +z is math −y, so the
            // front of the loop is near θ ≈ −0.7, not the far limb
            scene.setFramePlate(true, 5.58);
        },
        capture,
        restore,
    },
    {
        id: "sphere-fur-loop",
        label: "the field",
        title: "Figure 8(a) — the wind, and a small loop near the pole",
        figure: sphereFigure,
        view: scene.sphere,
        apply: () => {
            applyPose(scene.sphere, SPHERE_STANDARD);
            scene.setFramePlate(false);
            setS(scene.sForPhi(0.5));
        },
        capture,
        restore,
    },
    {
        id: "loop-family",
        label: "γ → γ̄",
        title: "Figure 8(b) — the loop stretched to its own reverse",
        figure: sphereFigure,
        view: scene.sphere,
        apply: () => {
            applyPose(scene.sphere, SPHERE_STANDARD);
            scene.setFramePlate(false);
            scene.bakeLoopFamily(8);
            sSlider.set(1);
            s = 1;
        },
        capture,
        restore,
    },
    graph("bookend-1-1", "9(a) (1,1)", "Figure 9(a) — γ: the graph is the (1,1)-curve", 0),
    graph("crossing", "9(b) crossing", "Figure 9(b) — the graph meets the core: a zero", 0.25),
    graph("bookend-1-neg1", "9(c) (1,−1)", "Figure 9(c) — γ̄: the graph is the (1,−1)-curve", 1),
];

attachWorkbench({
    app: scene.app,
    page: "poincare-render",
    title: "Poincaré",
    configs,
    controls: [sSlider, status],
    onSelect: (config) => {
        current = config;
    },
});
