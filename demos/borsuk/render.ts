/**
 * Borsuk–Ulam — RENDER entry: torus + domain sphere staged for paper
 * figures. Presets: the equator ribbon (paper Figure 4's odd twist), the
 * pinch (the moment f(x) = f(−x) — φ located by the finder), and the
 * domain sphere with the latitude and pair markers.
 * Deep link: ?figpreset=<id>.
 */

import { buildBorsukScene } from "./scene.ts";
import { attachFigureMode } from "../../src/app/FigureRenderer.ts";
import { attachRenderControls } from "../../src/app/RenderControls.ts";
import { titleBlock, slider, float } from "../../src/ui/controls.ts";

const scene = buildBorsukScene({ mode: "render", meridian: false });

const title = titleBlock({ title: "Borsuk–Ulam — figure renders", left: "16px" });
scene.hooks.afterRefresh = (s) => title.status(s.status, s.tone);
scene.refresh();

const torusFigure = attachFigureMode({
    app: scene.app,
    view: scene.torusView,
    name: "borsuk",
    urlState: () => ({ phi: scene.state.phi.toFixed(3), theta: scene.state.theta.toFixed(3) }),
});
const sphereFigure = attachFigureMode({
    app: scene.app,
    view: scene.sphere,
    name: "borsuk-sphere",
    groundY: -1.05,
    urlState: () => ({ phi: scene.state.phi.toFixed(3), theta: scene.state.theta.toFixed(3) }),
});

const phiSlider = float(
    slider({
        label: "latitude φ",
        min: 0.02,
        max: Math.PI / 2,
        step: Math.PI / 1000,
        value: scene.state.phi,
        onInput: (v) => scene.setPhi(v),
    }),
    { left: "16px", top: "14px" },
);
phiSlider.el.style.width = "230px";
scene.hooks.onStateJump = (phi) => phiSlider.set(phi);

attachRenderControls({
    previewEls: [phiSlider, title],
    presets: [
        {
            id: "equator-ribbon",
            label: "equator ribbon",
            figure: torusFigure,
            apply: () => {
                scene.setPhi(Math.PI / 2);
                phiSlider.set(Math.PI / 2);
            },
        },
        {
            id: "pinch",
            label: "the pinch",
            figure: torusFigure,
            apply: () => {
                scene.findPair(); // jumps φ/θ to the collision
            },
        },
        {
            id: "sphere-domain",
            label: "domain sphere",
            figure: sphereFigure,
            apply: () => {
                scene.setPhi(1.1);
                phiSlider.set(1.1);
            },
        },
    ],
});
