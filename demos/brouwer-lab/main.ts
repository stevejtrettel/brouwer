/**
 * Brouwer fixed point theorem — LAB entry: everything the website version
 * has, plus sculpt-brush tuning, the full meter set (finally displayed —
 * min |f−i|, Lk, the fixed-point census), PNG export, and the interactive
 * figure mode, in a control stack.
 */

import { buildBrouwerScene } from "../brouwer/scene.ts";
import { attachFigureMode } from "../../src/app/FigureRenderer.ts";
import {
    titleBlock,
    panelLabel,
    button,
    playButton,
    slider,
    readout,
    stack,
    float,
} from "../../src/ui/controls.ts";

const scene = buildBrouwerScene({ mode: "story", markIndex: true });

const title = titleBlock({ title: "Brouwer fixed point theorem (lab)" });
const imageLabel = panelLabel("", { top: "6px", left: "12px" });
imageLabel.innerHTML =
    'image f(D²) — grab &amp; fold to sculpt · fixed points: <b style="color:#ffb703">●</b> node (+1) <b style="color:#8d4fd3">●</b> saddle (−1)';
const domainLabel = panelLabel("", { top: "calc(50% + 6px)", left: "12px" });
domainLabel.innerHTML =
    'domain D² — the same fixed points: <b style="color:#ffb703">●</b> f(x) = x with index +1 · <b style="color:#8d4fd3">●</b> index −1';

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
        vertical: true,
        onInput: (r) => scene.setR(r),
    }),
    { right: "262px", top: "50%" },
);
rSlider.el.style.transform = "translateY(-50%)";
scene.hooks.onSweepStep = (r) => rSlider.set(r);

const controls = stack({ anchor: "top-right" });

const sweepBtn = playButton({
    label: "▶ sweep r → 0",
    hint: "shrink the circles with ghost trails — linked curves must touch along the way",
    onToggle: () => sweepBtn.set(scene.sweepToggle()),
});
scene.hooks.onSweepEnd = () => sweepBtn.set(false);

const pushBtn = playButton({
    label: "▶ play the linking argument",
    hint: "round trip at r = 1: Γ_f deforms onto the core (never crossing Γ_i), holds with the punchline, and returns",
    onToggle: () => pushBtn.set(scene.pushToggle()),
});
scene.hooks.onPushEnd = () => pushBtn.set(false);

controls.add(sweepBtn, pushBtn, button({ label: "↺ reset sheet", onClick: () => scene.reset() }));

const brushGroup = controls.group("sculpt brush");
if (scene.sculptor) {
    const brush = scene.sculptor.brush;
    brushGroup.add(
        slider({ label: "size σ", min: 0.1, max: 0.8, step: 0.01, value: brush.sigma, onInput: (v) => (brush.sigma = v) }),
        slider({ label: "iron", min: 0, max: 1, step: 0.01, value: brush.smoothing, onInput: (v) => (brush.smoothing = v) }),
        slider({ label: "spring", min: 0, max: 1, step: 0.01, value: brush.springback, onInput: (v) => (brush.springback = v) }),
    );
}

const meterGroup = controls.group("meters");
const minOut = readout({ label: "min |f−i|" });
const lkOut = readout({ label: "Lk" });
const fixedOut = readout({ label: "fixed points" });
const sumOut = readout({ label: "Σ index" });
meterGroup.add(minOut, lkOut, fixedOut, sumOut);

scene.hooks.afterRefresh = (s) => {
    title.status(s.status, s.tone);
    title.caption(s.caption);
    minOut.set(s.meters.minDist);
    lkOut.set(s.meters.lk);
    fixedOut.set(s.meters.fixedPoints);
    sumOut.set(s.meters.indexSum);
};
scene.refresh();

controls.add(
    button({ label: "⤓ save PNG", onClick: () => scene.app.exportPNG("brouwer") }),
    button({ label: "◉ figure (path traced)", onClick: () => figure.enter() }),
);
