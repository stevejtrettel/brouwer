/**
 * Borsuk–Ulam theorem — LAB entry: the kitchen sink. Everything the website
 * has, plus the slice-θ control, ribbon toggle, sculpt-brush tuning, the
 * analytic preset sliders (re-bake), meters, PNG export, and both figure
 * modes (torus and domain sphere).
 */

import { buildBorsukScene } from "./scene.ts";
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

const scene = buildBorsukScene({ mode: "story", meridian: true });

const title = titleBlock({ title: "Borsuk–Ulam theorem (lab)" });
panelLabel("domain S² — latitude γ_φ", { top: "6px", left: "12px" });
panelLabel("image f(S²) — grab to sculpt", { top: "calc(50% + 6px)", left: "12px" });

const torusFigure = attachFigureMode({
    app: scene.app,
    view: scene.torusView,
    name: "borsuk",
    hide: [scene.torusView.meridian],
    urlState: () => ({ phi: scene.state.phi.toFixed(3), theta: scene.state.theta.toFixed(3) }),
});
const sphereFigure = attachFigureMode({
    app: scene.app,
    view: scene.sphere,
    name: "borsuk-sphere",
    groundY: -1.05,
    urlState: () => ({ phi: scene.state.phi.toFixed(3), theta: scene.state.theta.toFixed(3) }),
});

const controls = stack({ anchor: "top-right" });

const phiSlider = slider({
    label: "φ",
    min: 0.02,
    max: Math.PI / 2,
    step: Math.PI / 1000,
    value: scene.state.phi,
    typein: true,
    onInput: (v) => scene.setPhi(v),
});
const thetaSlider = slider({
    label: "slice θ",
    min: 0,
    max: 2 * Math.PI,
    step: 0.01,
    value: scene.state.theta,
    typein: true,
    onInput: (v) => scene.setTheta(v),
});
scene.hooks.onSweepStep = (v) => phiSlider.set(v);
scene.hooks.onStateJump = (phi, theta) => {
    phiSlider.set(phi);
    thetaSlider.set(theta);
};

const sweepBtn = playButton({
    label: "▶ sweep φ (pole → equator)",
    onToggle: () => sweepBtn.set(scene.sweepToggle()),
});
scene.hooks.onSweepEnd = () => sweepBtn.set(false);

controls.add(
    phiSlider,
    thetaSlider,
    toggle({
        label: "ribbon f–f̄",
        value: true,
        onChange: (on) => {
            scene.ribbon.visible = on;
            if (on) scene.ribbon.refit();
        },
    }),
    sweepBtn,
    button({
        label: "⊚ find antipodal pair",
        onClick: () => {
            const pair = scene.findPair();
            title.caption(
                pair
                    ? `antipodal pair at x = (${pair.x.x.toFixed(3)}, ${pair.x.y.toFixed(3)}, ${pair.x.z.toFixed(3)})` +
                          `  ·  f(x) = f(−x) = (${pair.value.x.toFixed(3)}, ${pair.value.y.toFixed(3)})` +
                          `  ·  residual ${pair.residual.toExponential(1)}`
                    : "finder did not converge — degenerate map?",
            );
        },
    }),
);

const sculptGroup = controls.group("sculpt the balloon");
if (scene.sculptor) {
    const brush = scene.sculptor.brush;
    sculptGroup.add(
        slider({ label: "size σ", min: 0.1, max: 0.8, step: 0.01, value: brush.sigma, onInput: (v) => (brush.sigma = v) }),
        slider({ label: "iron", min: 0, max: 1, step: 0.01, value: brush.smoothing, onInput: (v) => (brush.smoothing = v) }),
        slider({ label: "spring", min: 0, max: 1, step: 0.01, value: brush.springback, onInput: (v) => (brush.springback = v) }),
        button({ label: "⎌ undo", onClick: () => scene.sculptor!.undo() }),
        button({ label: "↺ reset map", onClick: () => scene.resetMap() }),
    );
}

const presetGroup = controls.group("preset f (resets sculpt)");
presetGroup.add(
    slider({ label: "pole offset c", min: -1, max: 1, step: 0.01, value: 0.35, onInput: (v) => { scene.source.params.c = v; scene.rebake(); } }),
    slider({ label: "shift x", min: -0.5, max: 0.5, step: 0.01, value: 0.1, onInput: (v) => { scene.source.params.bx = v; scene.rebake(); } }),
    slider({ label: "shift y", min: -0.5, max: 0.5, step: 0.01, value: 0.15, onInput: (v) => { scene.source.params.by = v; scene.rebake(); } }),
);

const meterGroup = controls.group("meters");
const minOut = readout({ label: "min |f−f̄|" });
const twistOut = readout({ label: "twist" });
meterGroup.add(minOut, twistOut);

scene.hooks.afterRefresh = (s) => {
    title.status(s.status, s.tone);
    title.caption(s.caption);
    minOut.set(s.meters.minDist);
    twistOut.set(s.meters.twist);
};
scene.refresh();

controls.add(
    button({ label: "⤓ save PNG", onClick: () => scene.app.exportPNG("borsuk") }),
    button({ label: "◉ figure: torus", onClick: () => torusFigure.enter() }),
    button({ label: "◉ figure: sphere", onClick: () => sphereFigure.enter() }),
);
