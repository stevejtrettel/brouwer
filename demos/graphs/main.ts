/**
 * Graphs — WEBSITE entry: the establishing picture, one idea and one
 * motion. Slide r; the circle, its crumpled image, and the graph curve in
 * the solid torus move together.
 */

import { buildGraphsScene } from "./scene.ts";
import { titleBlock, slider, float } from "../../src/ui/controls.ts";

const scene = buildGraphsScene();

const title = titleBlock({ title: "Graphing a disk map", left: "16px" });
title.status("θ ↦ (θ, f_r(θ)) — the graph meets every meridian disk exactly once", "quiet");
title.caption(
    "the circle S_r in the domain · its folded image f(S_r) in the codomain · " +
    "the graph of f_r in the solid torus",
);

const rSlider = float(
    slider({
        label: "radius r",
        min: 0.05,
        max: 1,
        step: 0.002,
        value: scene.state.r,
        onInput: (r) => scene.setR(r),
    }),
    { left: "16px", top: "14px" },
);
rSlider.el.style.width = "230px";
