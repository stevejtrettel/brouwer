/**
 * Brouwer — RENDER entry: the torus scene full-canvas, staged for paper
 * figures. Preset pills set up each planned figure (small-r unlinked pair,
 * the r = 1 linked pair, the push-to-core deformation with ghost trails);
 * Render… opens the quality modal and hands off to the path tracer.
 * Deep link: ?figpreset=<id>.
 */

import { buildBrouwerScene } from "./scene.ts";
import { attachFigureMode } from "../../src/app/FigureRenderer.ts";
import { attachRenderControls } from "../../src/app/RenderControls.ts";
import { titleBlock, slider, float } from "../../src/ui/controls.ts";

const scene = buildBrouwerScene({ mode: "render" });

const title = titleBlock({ title: "Brouwer — figure renders", left: "16px" });
scene.hooks.afterRefresh = (s) => title.status(s.status, s.tone);
scene.refresh();

const figure = attachFigureMode({
    app: scene.app,
    view: scene.torusView,
    name: "brouwer",
    urlState: () => ({ r: scene.state.r.toFixed(3) }),
});

const rSlider = float(
    slider({
        label: "radius r",
        min: 0.02,
        max: 1,
        step: 0.002,
        value: scene.state.r,
        onInput: (r) => scene.setR(r),
    }),
    { left: "16px", top: "14px" },
);
rSlider.el.style.width = "230px";

attachRenderControls({
    previewEls: [rSlider, title],
    presets: [
        {
            id: "small-r",
            label: "small r (unlinked)",
            figure,
            apply: () => {
                scene.setR(0.3); // setR cancels any baked deformation
                rSlider.set(0.3);
            },
        },
        {
            id: "r-1",
            label: "r = 1 (linked)",
            figure,
            apply: () => {
                scene.setR(1);
                rSlider.set(1);
            },
        },
        {
            id: "push-core-ghosts",
            label: "push to core",
            figure,
            apply: () => {
                scene.bakePushToCore(7);
                rSlider.set(1);
            },
        },
    ],
});
