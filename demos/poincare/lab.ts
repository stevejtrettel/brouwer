/**
 * Poincaré / hairy-ball theorem — LAB entry: the kitchen sink. Everything
 * the website has, plus slice-θ, comb-brush tuning, the analytic preset
 * sliders (re-bake), the full meter set, PNG export, and both figure modes.
 */

import { buildPoincareScene } from "./scene.ts";
import { attachFigureMode } from "../../src/app/FigureRenderer.ts";
import {
    titleBlock,
    panelLabel,
    button,
    playButton,
    slider,
    toggle,
    readout,
    stack,
} from "../../src/ui/controls.ts";

const scene = buildPoincareScene({ mode: "story", meridian: true });

const title = titleBlock({ title: "Poincaré / hairy-ball theorem (lab)" });
panelLabel("domain S² — field v, latitude γ_φ, frame (e₁, e₂)", { top: "6px", left: "12px" });
panelLabel("fiber disk — trace of p_γ = (⟨v,e₁⟩, ⟨v,e₂⟩)", { top: "calc(50% + 6px)", left: "12px" });

const torusFigure = attachFigureMode({
    app: scene.app,
    view: scene.torusView,
    name: "poincare",
    hide: [scene.torusView.meridian],
    urlState: () => ({ phi: scene.state.phi.toFixed(3), theta: scene.state.theta.toFixed(3) }),
});
const sphereFigure = attachFigureMode({
    app: scene.app,
    view: scene.sphere,
    name: "poincare-sphere",
    groundY: -1.05,
    urlState: () => ({ phi: scene.state.phi.toFixed(3), theta: scene.state.theta.toFixed(3) }),
});

const controls = stack({ anchor: "top-right" });

const phiSlider = slider({
    label: "φ",
    min: 0.05,
    max: Math.PI - 0.05,
    step: (Math.PI - 0.1) / 500,
    value: scene.state.phi,
    typein: true,
    onInput: (v) => scene.setPhi(v),
});
scene.hooks.onSweepStep = (v) => phiSlider.set(v);

const sweepBtn = playButton({
    label: "▶ sweep φ (pole → pole)",
    onToggle: () => sweepBtn.set(scene.sweepToggle()),
});
scene.hooks.onSweepEnd = () => sweepBtn.set(false);

controls.add(
    phiSlider,
    slider({
        label: "slice θ",
        min: 0,
        max: 2 * Math.PI,
        step: 0.01,
        value: scene.state.theta,
        typein: true,
        onInput: (v) => scene.setTheta(v),
    }),
    sweepBtn,
);

const combGroup = controls.group("comb the field");
combGroup.add(
    toggle({ label: "✂ comb mode (drag the sphere)", onChange: (on) => scene.setCombMode(on) }),
);
if (scene.comb) {
    const brush = scene.comb.brush;
    combGroup.add(
        slider({ label: "size σ", min: 0.1, max: 0.8, step: 0.01, value: brush.sigma, onInput: (v) => (brush.sigma = v) }),
        slider({ label: "strength", min: 0.5, max: 5, step: 0.1, value: brush.strength, onInput: (v) => (brush.strength = v) }),
        slider({ label: "iron", min: 0, max: 1, step: 0.01, value: brush.smoothing, onInput: (v) => (brush.smoothing = v) }),
        button({ label: "⎌ undo", onClick: () => scene.comb!.undo() }),
        button({ label: "↺ reset field", onClick: () => scene.resetField() }),
    );
}

const presetGroup = controls.group("preset field a − ⟨a,x⟩x (resets comb)");
presetGroup.add(
    slider({ label: "a·x̂", min: -1, max: 1, step: 0.01, value: 1, onInput: (v) => { scene.source.params.ax = v; scene.rebake(); } }),
    slider({ label: "a·ŷ", min: -1, max: 1, step: 0.01, value: 0, onInput: (v) => { scene.source.params.ay = v; scene.rebake(); } }),
    slider({ label: "a·ẑ", min: -1, max: 1, step: 0.01, value: 0, onInput: (v) => { scene.source.params.az = v; scene.rebake(); } }),
);

const meterGroup = controls.group("meters");
const minOut = readout({ label: "min |v|" });
const windingOut = readout({ label: "winding" });
const zerosOut = readout({ label: "zeros of v" });
const sumOut = readout({ label: "Σ index" });
meterGroup.add(minOut, windingOut, zerosOut, sumOut);

scene.hooks.afterRefresh = (s) => {
    title.status(s.status, s.tone);
    title.caption(s.caption);
    minOut.set(s.meters.minV);
    windingOut.set(s.meters.winding);
    zerosOut.set(s.meters.zeros);
    sumOut.set(s.meters.indexSum);
};
scene.refresh();

controls.add(
    button({ label: "⤓ save PNG", onClick: () => scene.app.exportPNG("poincare") }),
    button({ label: "◉ figure: torus", onClick: () => torusFigure.enter() }),
    button({ label: "◉ figure: sphere", onClick: () => sphereFigure.enter() }),
);
