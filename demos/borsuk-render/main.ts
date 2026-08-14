/**
 * Borsuk–Ulam — FIGURE PAGE. Every Borsuk configuration lives here: the three
 * setup panels of Figure 5 (sphere → crushed → graphs), the three-torus sweep
 * of Figure 6 (pole → pinch → equator), and the ℓ_θ row of Figure 7.
 *
 * The workbench owns the layout — the figure sits inset at its own aspect, the
 * controls live in the drawer, the sculptable balloon and the domain sphere are
 * parked in the setup strip where they cannot be mistaken for output. This page
 * only says what the configurations ARE and how to capture their state.
 *
 * Note it builds the STORY assembly: the render page wants the sculptable
 * balloon, so figure furniture (the ℓ_θ plate row) has to be asked for.
 */

import { buildBorsukScene } from "../borsuk/scene.ts";
import { attachFigureMode } from "../../src/app/FigureRenderer.ts";
import { attachWorkbench } from "../../src/app/FigureWorkbench.ts";
import type { FigureConfig } from "../../src/app/FigureWorkbench.ts";
import { applyPose, PLATE_ROW, SPHERE_STANDARD, TORUS_RIBBON } from "../../src/app/figurePose.ts";
import { slider, readout } from "../../src/ui/controls.ts";
import { roleColor } from "../../src/components/theme.ts";
import { loadSphereCrumple } from "../../src/math/maps/crumple.ts";

const scene = buildBorsukScene({
    mode: "story",
    meridian: false,
    thetaProbe: false,
    segmentRow: true,
});

// ------------------------------------------------------------------ controls
const phiSlider = slider({
    label: "latitude φ",
    min: 0.02,
    max: Math.PI / 2,
    step: Math.PI / 1000,
    value: scene.state.phi,
    onInput: (v) => scene.setPhi(v),
});
const status = readout({ label: "" });
scene.hooks.afterRefresh = (s) => status.set(s.status);
scene.hooks.onStateJump = (phi) => phiSlider.set(phi);
scene.refresh();

// ------------------------------------------------------------------ figures
// the workbench reports which configuration is live (several share one
// FigureMode, so "which figure is active" cannot answer it), and figure mode
// asks that configuration for the shape to trace
let current: FigureConfig | undefined;
const size = (): { width: number; height: number } => {
    const [w, h] = (current?.size ?? "1440x900").split("x").map(Number);
    return { width: w || 1440, height: h || 900 };
};

const torusFigure = attachFigureMode({
    app: scene.app,
    view: scene.torusView,
    name: "borsuk",
    frameSize: size,
    urlState: () => ({ phi: scene.state.phi.toFixed(3) }),
});
const sphereFigure = attachFigureMode({
    app: scene.app,
    view: scene.sphere,
    name: "borsuk-sphere",
    groundY: -1.05,
    frameSize: size,
    urlState: () => ({ phi: scene.state.phi.toFixed(3) }),
});

/** every configuration persists the same handful of numbers */
const capture = (): Record<string, unknown> => ({ phi: scene.state.phi });
const restore = (state: Record<string, unknown>): void => {
    if (typeof state.phi === "number") {
        scene.setPhi(state.phi);
        phiSlider.set(state.phi);
    }
};

const band = (id: string, label: string, title: string, phi: number | "pair"): FigureConfig => ({
    id,
    label,
    title,
    figure: torusFigure,
    view: scene.torusView,
    apply: () => {
        applyPose(scene.torusView, TORUS_RIBBON);
        scene.setSegmentRow(false);
        scene.setRibbonFigure(true);
        scene.setCrushFigure(false);
        // gold belongs here: this sequence is where the pair is forced
        scene.setPairMarkers(true);
        scene.sphere.latitude.setColor(roleColor("identity"));
        if (phi === "pair") {
            const pair = scene.findPair(); // jumps φ to the touch
            // and mark it: at the pinch the two curves run together for a long
            // stretch, so "where do they meet" is not readable without a dot
            scene.setPinchMarker(
                pair?.found ? { theta: pair.theta, x: pair.value.x, y: pair.value.y } : null,
            );
        } else {
            scene.setPinchMarker(null);
            scene.setPhi(phi);
            phiSlider.set(phi);
        }
    },
    capture,
    restore,
});

const imageFigureMode = scene.imageFigure
    ? attachFigureMode({
          app: scene.app,
          view: scene.imageFigure,
          name: "borsuk-image",
          frameSize: () => ({ width: 1000, height: 1000 }),
      })
    : null;

/**
 * Figure 5 — the Borsuk setup, deliberately the same three beats as Figure 1:
 * the domain, its image, and the graph read off in the solid torus. A reader
 * who has learned to read Figure 1 is reading the same sentence with new nouns,
 * and that parallel is the point of the paper.
 */
const setupConfigs: FigureConfig[] = [
    {
        id: "setup-sphere",
        label: "the sphere",
        title: "Figure 5(a) — the domain S², sliced into latitudes",
        figure: sphereFigure,
        view: scene.sphere,
        size: "1000x1000",
        apply: () => {
            scene.setCrushFigure(false);
            applyPose(scene.sphere, SPHERE_STANDARD);
            scene.setPhi(1.1);
            phiSlider.set(1.1);
            // BOTH circles: S_φ and its antipodal partner −S_φ, coloured to
            // match the image loops they produce in (b) and the graphs they
            // become in (c). That colour chain is the whole correspondence.
            scene.antipodalLatitude.visible = true;
            // S_φ wears the colour of the loop it produces, so the chain
            // circle → image loop → graph is one colour the whole way
            scene.sphere.latitude.setColor(roleColor("map"));
            // and NO gold — see setPairMarkers. Nothing has been forced yet in
            // a setup figure; the pair belongs to the figure that finds it.
            scene.setPairMarkers(false);
        },
        capture,
        restore,
    },
    ...(scene.imageFigure && imageFigureMode
        ? [
              {
                  id: "setup-image",
                  label: "crushed flat",
                  title: "Figure 5(b) — the sphere crushed into the disk: f(S²), with f(S_φ) on it",
                  figure: imageFigureMode,
                  view: scene.imageFigure,
                  size: "1000x1000",
                  apply: () => {
                      // the grid, not the texture — see setCrushFigure
                      scene.setCrushFigure(true);
                      scene.setPairMarkers(false);
                      scene.setPhi(1.1);
                      phiSlider.set(1.1);
                      scene.imageFigure!.camera.position.set(0, 0, 3.6);
                      scene.imageFigure!.controls.target.set(0, 0, 0);
                      scene.imageFigure!.controls.update();
                  },
                  capture,
                  restore,
              } satisfies FigureConfig,
          ]
        : []),
    {
        id: "setup-graphs",
        label: "read off in the torus",
        title: "Figure 5(c) — Γ_{f_φ} and Γ_{f̄_φ}, read off in the solid torus",
        figure: torusFigure,
        view: scene.torusView,
        size: "1440x900",
        apply: () => {
            scene.setCrushFigure(false);
            applyPose(scene.torusView, TORUS_RIBBON);
            scene.setRibbonFigure(false);
            scene.setPhi(1.1);
            phiSlider.set(1.1);
        },
        capture,
        restore,
    },
];

const configs: FigureConfig[] = [
    ...setupConfigs,
    band("polar-ribbon", "pole", "Figure 6(a) — near the pole: a flat annulus", 0.22),
    band("pinch", "the pinch", "Figure 6(b) — the band pinches: f(x) = f(−x)", "pair"),
    band("equator-ribbon", "equator", "Figure 6(c) — the equator: an odd twist", Math.PI / 2),
    {
        id: "segments",
        label: "ℓ_θ row",
        title: "Figure 7 — ℓ_θ at five values of θ",
        figure: torusFigure,
        view: scene.torusView,
        size: "1900x620",
        apply: () => {
            scene.setCrushFigure(false);
            scene.setPairMarkers(true);
            applyPose(scene.torusView, PLATE_ROW);
            scene.setPhi(Math.PI / 2); // the equator: where the twist is odd
            phiSlider.set(Math.PI / 2);
            scene.setSegmentRow(true);
        },
        capture,
        restore,
    },
    {
        id: "sphere-domain",
        label: "sphere",
        title: "Figure 5(a) — the domain, sliced into latitudes",
        figure: sphereFigure,
        view: scene.sphere,
        apply: () => {
            scene.setCrushFigure(false);
            scene.setPairMarkers(true);
            applyPose(scene.sphere, SPHERE_STANDARD);
            scene.setPhi(1.1);
            phiSlider.set(1.1);
        },
        capture,
        restore,
    },
];

attachWorkbench({
    app: scene.app,
    page: "borsuk-render",
    title: "Borsuk–Ulam",
    configs,
    // the balloon is only ever scaffolding — it is where the map is sculpted.
    // (The domain sphere is a figure in its own right, 5(a), so it is a tab
    // rather than a permanent fixture down here.)
    aux: scene.imagePanel
        ? [{ label: "image f(S²) — sculpt here", viewport: scene.imagePanel }]
        : [],
    controls: [phiSlider, status],
    onSelect: (config) => {
        current = config;
    },
});

// ---------------------------------------------------------------- the map
//
// The Borsuk figures need a specific crush, not whatever the analytic preset
// happens to give: one whose image is visibly flattened and whose antipodal
// coincidence sits where a figure can point at it. Sculpt one in /d/sphere-map/
// and save it as `borsuk`; this page picks it up, and falls back to the preset
// when there is none.
{
    const name = new URLSearchParams(location.search).get("map") ?? "borsuk";
    void loadSphereCrumple(name, scene.f.grid)
        .then((map) => {
            if (!map) return;
            scene.f.positions.set(map.positions);
            scene.refresh();
        })
        .catch((error: unknown) => console.warn(`sphere map "${name}" not applied:`, error));
}
