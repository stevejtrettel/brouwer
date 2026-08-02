/**
 * Poincaré — RENDER entry: torus + domain sphere staged for paper figures.
 * Presets: the (1,1)-curve bookend (small north loop), the (1,−1) bookend
 * (near the south pole), and the fur-covered domain sphere with the
 * latitude loop. Deep link: ?figpreset=<id>.
 */

import { buildPoincareScene } from "./scene.ts";
import { attachFigureMode } from "../../src/app/FigureRenderer.ts";
import { attachRenderControls } from "../../src/app/RenderControls.ts";
import { titleBlock, slider, float } from "../../src/ui/controls.ts";

const scene = buildPoincareScene({ mode: "render", meridian: false });

const title = titleBlock({ title: "Poincaré — figure renders", left: "16px" });
scene.hooks.afterRefresh = (s) => title.status(s.status, s.tone);
scene.refresh();

const torusFigure = attachFigureMode({
    app: scene.app,
    view: scene.torusView,
    name: "poincare",
    urlState: () => ({ phi: scene.state.phi.toFixed(3) }),
});
const sphereFigure = attachFigureMode({
    app: scene.app,
    view: scene.sphere,
    name: "poincare-sphere",
    groundY: -1.05,
    urlState: () => ({ phi: scene.state.phi.toFixed(3) }),
});

const phiSlider = float(
    slider({
        label: "latitude φ",
        min: 0.05,
        max: Math.PI - 0.05,
        step: (Math.PI - 0.1) / 500,
        value: scene.state.phi,
        onInput: (v) => scene.setPhi(v),
    }),
    { left: "16px", top: "14px" },
);
phiSlider.el.style.width = "230px";

const setPhi = (v: number): void => {
    scene.setPhi(v);
    phiSlider.set(v);
};

attachRenderControls({
    previewEls: [phiSlider, title],
    presets: [
        {
            id: "bookend-1-1",
            label: "(1,1) north",
            figure: torusFigure,
            apply: () => setPhi(0.15),
        },
        {
            id: "bookend-1-neg1",
            label: "(1,−1) south",
            figure: torusFigure,
            apply: () => setPhi(Math.PI - 0.15),
        },
        {
            id: "sphere-fur-loop",
            label: "domain sphere",
            figure: sphereFigure,
            apply: () => setPhi(0.5),
        },
    ],
});
