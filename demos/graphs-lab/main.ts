/**
 * Graphs — LAB entry: the establishing scene with every knob in a kit
 * stack (r, staging toggles, PNG export, figure mode).
 */

import { buildGraphsScene } from "../graphs/scene.ts";
import { attachFigureMode } from "../../src/app/FigureRenderer.ts";
import { titleBlock, slider, toggle, button, stack } from "../../src/ui/controls.ts";

const scene = buildGraphsScene();

const title = titleBlock({ title: "Graphing a disk map — lab", left: "16px" });
title.status("θ ↦ (θ, f_r(θ)) — the graph meets every meridian disk exactly once", "quiet");

const figure = attachFigureMode({
    app: scene.app,
    view: scene.view,
    name: "graphs",
    urlState: () => ({ r: scene.state.r.toFixed(3) }),
});

const panel = stack({ anchor: "top-right" });
panel.add(
    slider({
        label: "radius r",
        min: 0.05,
        max: 1,
        step: 0.002,
        value: scene.state.r,
        onInput: (r) => scene.setR(r),
    }),
    toggle({
        label: "standing plates",
        value: false,
        onChange: (on) => scene.setLayout(on ? "standing" : "tabletop"),
    }),
    toggle({
        label: "gold dots",
        value: false,
        onChange: (on) => scene.setDotStyle(on ? "gold" : "accent"),
    }),
    button({ label: "⤓ export PNG", onClick: () => scene.app.exportPNG("graphs") }),
    button({ label: "◉ figure mode", onClick: () => figure.enter() }),
);
