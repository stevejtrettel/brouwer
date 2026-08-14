/**
 * Graphing a disk map — FIGURE PAGE. The establishing figure (Figure 1) and
 * the n = 1 card (Figure 2a), plus the two configurations currently cut from
 * the set, kept reachable so the decision stays arguable.
 */

import { buildGraphsScene } from "../graphs/scene.ts";
import type { GraphsActor } from "../graphs/scene.ts";
import { attachFigureMode } from "../../src/app/FigureRenderer.ts";
import { attachWorkbench } from "../../src/app/FigureWorkbench.ts";
import type { FigureConfig } from "../../src/app/FigureWorkbench.ts";
import { applyPose } from "../../src/app/figurePose.ts";
import { slider } from "../../src/ui/controls.ts";

const scene = buildGraphsScene();

// ------------------------------------------------------------------ controls
const rSlider = slider({
    label: "radius r",
    min: 0.05,
    max: 1,
    step: 0.002,
    value: scene.state.r,
    onInput: (r) => scene.setR(r),
});

// ------------------------------------------------------------------ figures
let current: FigureConfig | undefined;
const size = (): { width: number; height: number } => {
    const [w, h] = (current?.size ?? "1440x900").split("x").map(Number);
    return { width: w || 1440, height: h || 900 };
};

const figure = attachFigureMode({
    app: scene.app,
    view: scene.view,
    name: "graphs",
    frameSize: size,
    urlState: () => ({ r: scene.state.r.toFixed(3) }),
});

/** Which actor is soloed, if any — part of the scene state, so it has to be
 *  saved with the rest or a reloaded panel comes back as the group portrait. */
let soloActor: GraphsActor | null = null;

/** r belongs to the PAGE, not to a panel: Figure 1's three panels are the same
 *  circle seen three ways, so they must be drawn at one radius, and moving the
 *  slider has to move all of them. Saved once, under the workbench's page key. */
const pageCapture = (): Record<string, unknown> => ({ r: scene.state.r });
const pageRestore = (state: Record<string, unknown>): void => {
    if (typeof state.r === "number") {
        scene.setR(state.r);
        rSlider.set(state.r);
    }
};

const capture = (): Record<string, unknown> => ({ solo: soloActor });
const restore = (state: Record<string, unknown>): void => {
    // Solo before anything else: setLayout() re-parks every actor AND moves the
    // camera, which would undo the solo and fight the pose restored after this.
    soloActor = (state.solo as GraphsActor | null | undefined) ?? null;
    scene.setSolo(soloActor);
};

/**
 * Figure 1 is composed in LaTeX from three panels, so each panel is its own
 * picture rather than a crop of a group portrait: scene.setSolo() puts one
 * actor at the origin and squares the plates up to the camera. The two disks
 * are flat objects and get square frames head on; the torus is the only one
 * that is genuinely wide, and gets 2:1.
 */
const solo = (actor: GraphsActor): void => {
    scene.setAnatomy(false);
    scene.setIVT(false);
    soloActor = actor;
    scene.setSolo(actor);
};

// plate radius is 1.04 · DISK_SCALE = 1.56; fov 42 puts the half-height at
// d·tan(21°), so d ≈ 4.6 leaves a comfortable margin in a square frame
const PLATE_D = 4.6;

const configs: FigureConfig[] = [
    {
        id: "domain",
        label: "the domain",
        title: "Figure 1(a) — the domain disk and the circle S_r",
        figure,
        view: scene.view,
        size: "1000x1000",
        apply: () => {
            solo("domain");
            applyPose(scene.view, { position: [0, 0, PLATE_D], target: [0, 0, 0] });
        },
        capture,
        restore,
    },
    {
        id: "codomain",
        label: "the codomain",
        title: "Figure 1(b) — the crumpled image, and f(S_r) over the folds",
        figure,
        view: scene.view,
        size: "1000x1000",
        apply: () => {
            solo("codomain");
            applyPose(scene.view, { position: [0, 0, PLATE_D], target: [0, 0, 0] });
        },
        capture,
        restore,
    },
    {
        id: "torus",
        label: "the graph",
        title: "Figure 1(c) — the graph \u0393_{f_r} in the solid torus",
        figure,
        view: scene.view,
        size: "1600x800",
        apply: () => {
            solo("torus");
            applyPose(scene.view, { position: [0, 2.63, 4.71], target: [0, 0.05, 0] });
        },
        capture,
        restore,
    },
    {
        id: "overview",
        label: "cut \u00b7 all three at once",
        title: "CUT \u2014 domain \u00b7 crumpled image \u00b7 the graph, in one wide frame",
        figure,
        view: scene.view,
        size: "1680x760", // three actors in a row: a wide picture
        apply: () => {
            scene.setAnatomy(false);
            scene.setIVT(false);
            soloActor = null;
            scene.setSolo(null);
        },
        capture,
        restore,
    },
    {
        id: "ivt-borsuk",
        label: "n = 1, Borsuk\u2013Ulam",
        title: "Figure 2(b) \u2014 an antipodal pair at the same height",
        figure,
        view: scene.view,
        size: "1200x1000",
        apply: () => {
            soloActor = null;
            scene.setSolo(null);
            scene.setCircleGraph(true);
            // The pose is derived from the bar, not chosen: the claim being
            // made is that this one segment is HORIZONTAL, and a horizontal
            // segment only projects to a horizontal segment when the camera
            // sees it broadside and from a low elevation. So look along the
            // perpendicular to the bar, from 14° up. Well back, too — the
            // object is as deep as it is wide, and a close camera magnifies
            // the near arc of the circle out of the frame.
            // The group is rotated −90° about x, so a local (cos t, sin t, h)
            // lands at world (cos t, h, −sin t): the bar runs along
            // (cos t₀, 0, −sin t₀) in the ground plane, and the broadside
            // direction is its perpendicular there.
            const t0 = scene.circleGraphAntipode;
            const el = (14 * Math.PI) / 180;
            const d = 5.3;
            const eye = 0.85;
            applyPose(scene.view, {
                position: [
                    d * Math.sin(t0) * Math.cos(el),
                    eye + d * Math.sin(el),
                    d * Math.cos(t0) * Math.cos(el),
                ],
                target: [0, eye, 0],
            });
        },
        capture,
        restore,
    },
    {
        id: "ivt",
        label: "n = 1, Brouwer",
        title: "Figure 2(a) — the graphs must cross",
        figure,
        view: scene.view,
        size: "1200x1000",
        apply: () => {
            soloActor = null;
            scene.setSolo(null);
            scene.setAnatomy(false);
            scene.setIVT(true);
            applyPose(scene.view, { position: [0, 1.0, 5.0], target: [0, 1.0, 0] });
        },
        capture,
        restore,
    },
    {
        id: "anatomy",
        label: "cut · the torus",
        title: "CUT — the solid torus and its parts",
        figure,
        view: scene.view,
        apply: () => {
            soloActor = null;
            scene.setSolo(null);
            scene.setIVT(false);
            scene.setAnatomy(true);
            applyPose(scene.view, { position: [1.9, 4.2, 7.6], target: [1.9, 0, 0] });
        },
        capture,
        restore,
    },
    {
        id: "crumple",
        label: "cut · the crumple",
        title: "CUT — a crumpled copy smushed onto the flat one",
        figure,
        view: scene.view,
        size: "1200x1000",
        apply: () => {
            soloActor = null;
            scene.setSolo(null);
            scene.setAnatomy(false);
            scene.setIVT(false);
            scene.setLayout("tabletop");
            // the codomain plate sits at x = −3.4 on the ground; frame it alone,
            // from the elevation of someone leaning over a table
            applyPose(scene.view, { position: [-3.4, 1.93, 3.45], target: [-3.4, -0.67, 0.35] });
        },
        capture,
        restore,
    },
];

attachWorkbench({
    app: scene.app,
    page: "graphs-render",
    title: "Slicing and graphing",
    configs,
    controls: [rSlider],
    onSelect: (config) => {
        current = config;
    },
    pageCapture,
    pageRestore,
});
