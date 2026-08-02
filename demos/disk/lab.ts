/**
 * Disk map playground — LAB entry: the kitchen sink. Everything the website
 * version has, plus brush tuning, the post similarity (move/shrink
 * everything), live meters, and PNG export, in a quiet control stack.
 */

import { buildDiskScene } from "./scene.ts";
import {
    titleBlock,
    panelLabel,
    button,
    slider,
    readout,
    stack,
} from "../../src/ui/controls.ts";

const scene = buildDiskScene();

const title = titleBlock({ title: "Disk map playground (lab)", left: "16px" });
title.status("grab the sheet and pull · drag a coral rim dot to fold");

panelLabel("domain D²", { top: "8px", left: "calc(25% - 30px)" });
panelLabel("image f(D²)", { top: "8px", left: "calc(75% - 34px)" });

const controls = stack({ anchor: "top-right" });

const brushGroup = controls.group("brush");
brushGroup.add(
    slider({ label: "size σ", min: 0.1, max: 0.8, step: 0.01, value: scene.brush.sigma, typein: true, onInput: (v) => (scene.brush.sigma = v) }),
    slider({ label: "iron", min: 0, max: 1, step: 0.01, value: scene.brush.smoothing, onInput: (v) => (scene.brush.smoothing = v) }),
    slider({ label: "spring", min: 0, max: 1, step: 0.01, value: scene.brush.springback, onInput: (v) => (scene.brush.springback = v) }),
);

const postGroup = controls.group("move / shrink everything");
const onPost = (): void => {
    scene.refresh();
    scene.census();
};
const sSlider = slider({ label: "scale", min: 0.2, max: 1, step: 0.01, value: 1, onInput: (v) => { scene.post.params.s = v; onPost(); } });
const cxSlider = slider({ label: "shift x", min: -0.8, max: 0.8, step: 0.01, value: 0, onInput: (v) => { scene.post.params.cx = v; onPost(); } });
const cySlider = slider({ label: "shift y", min: -0.8, max: 0.8, step: 0.01, value: 0, onInput: (v) => { scene.post.params.cy = v; onPost(); } });
postGroup.add(sSlider, cxSlider, cySlider);

controls.add(
    button({ label: "⎌ undo", onClick: () => scene.sculptor.undo() }),
    button({
        label: "↺ reset",
        onClick: () => {
            scene.reset();
            sSlider.set(1);
            cxSlider.set(0);
            cySlider.set(0);
        },
    }),
);

const meterGroup = controls.group("meters");
const foldsOut = readout({ label: "folds" });
const fixedOut = readout({ label: "fixed points" });
const sumOut = readout({ label: "Σ index" });
meterGroup.add(foldsOut, fixedOut, sumOut);
scene.hooks.onMeters = (m) => {
    foldsOut.set(m.folds);
    fixedOut.set(m.fixedPoints);
    sumOut.set(m.indexSum);
};
scene.census();

controls.add(button({ label: "⤓ save PNG", onClick: () => scene.app.exportPNG("disk-playground") }));
