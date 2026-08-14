/**
 * Poincaré / hairy-ball theorem — WEBSITE entry. The fur is COMBABLE by
 * pointer alone (the borsuk balloon's idiom, on a 3D panel): left-drag on
 * the sphere combs the field, right-drag (or two fingers) orbits it. ONE
 * control besides that: the γ → γ̄ deformation slider — its first half walks
 * the latitudes down to the south pole, its second half carries the small
 * loop over the north pole, so the graph goes (1,1) → (1,−1) and must cross
 * the core — ◎ jumps to a crossing, ▶ plays the whole trip. Comb all you
 * like: Σ index stays 2, so the crossing never goes away.
 */

import { MOUSE, TOUCH } from "three";
import { buildPoincareScene } from "./scene.ts";
import { titleBlock, panelLabel, button, playButton, slider, float } from "../../src/ui/controls.ts";

const scene = buildPoincareScene({ mode: "story", meridian: false, thetaProbe: false });

// comb by default — no mode button. The brush owns the primary button and
// the first finger; OrbitControls keeps the secondary button and two-finger
// gestures, so both gestures live on the same panel without a toggle.
scene.setCombMode(true);
const sphereControls = scene.sphere.controls;
sphereControls.mouseButtons = { LEFT: null, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE };
sphereControls.touches = { ONE: null, TWO: TOUCH.DOLLY_ROTATE };
// the scene's default gate switches orbit OFF for the whole of comb mode
// (the lab's modal semantics). Here the split is by button, so orbit stays
// live and only an in-progress stroke locks it out.
scene.sphere.setOrbitGate(() => !scene.comb?.active);

// the sphere turns gently on its own — as an invitation — and stops for good
// the moment the visitor combs: the brush measures each drag against the
// CURRENT view, so a spinning sphere would smear the stroke
sphereControls.autoRotate = true;
sphereControls.autoRotateSpeed = 0.7;
scene.app.addAnimateCallback(() => {
    if (scene.comb?.active) sphereControls.autoRotate = false;
});

const title = titleBlock({ title: "Poincaré / hairy-ball theorem" });
scene.hooks.afterRefresh = (s) => {
    title.status(s.status, s.tone);
    title.caption(s.caption);
};
scene.refresh();

const sphereLabel = panelLabel("", { top: "6px", left: "12px" });
sphereLabel.innerHTML =
    'the field v — drag to comb the fur (right-drag to turn the sphere) · zeros: ' +
    '<b style="color:#ffb703">●</b> index +1 <b style="color:#8d4fd3">●</b> index −1';
const traceLabel = panelLabel("", { top: "calc(50% + 6px)", left: "12px" });
traceLabel.innerHTML =
    'fiber disk — <b style="color:#0f9b8e">—</b> the loop p_γ: its winding around the center is what forces a zero';

const sSlider = float(
    slider({
        label: "γ → γ̄",
        min: 0,
        max: 1,
        step: 0.002,
        value: scene.sForPhi(scene.state.phi),
        vertical: true,
        onInput: (s) => scene.setHomotopy(s),
    }),
    { right: "22px", top: "50%" },
);
sSlider.el.style.transform = "translateY(-50%)";
scene.hooks.onHomotopyStep = (s) => sSlider.set(s);
scene.setHomotopy(scene.sForPhi(scene.state.phi)); // slider and scene agree from the start

// under the slider: jump straight to a crossing moment
const zeroBtn = float(
    button({
        label: "◎ zero",
        hint: "jump the deformation to a loop through a zero of the field — the graph touches the core there (cycles through all zeros)",
        onClick: () => {
            const s = scene.snapToZero();
            if (s !== null) sSlider.set(s);
        },
    }),
    { right: "14px", top: "calc(50% + 158px)" },
);
zeroBtn.el.style.fontSize = "12px";

// the paper's punchline, playable: deform γ continuously to its reverse —
// the graph must cross the core somewhere along the way
const homotopyBtn = float(
    playButton({
        label: "▶ γ → γ̄",
        hint: "deform the loop to its own reverse: down through the latitudes, then up and over the pole — the graph is forced across the core",
        onToggle: () => homotopyBtn.set(scene.homotopyToggle()),
    }),
    { right: "14px", top: "calc(50% + 196px)" },
);
homotopyBtn.el.style.fontSize = "12px";
scene.hooks.onHomotopyEnd = () => homotopyBtn.set(false);

// the comb's two escape hatches, matching borsuk's sculpting chrome
float(
    button({
        label: "⎌ undo",
        hint: "undo the last comb stroke",
        onClick: () => scene.comb?.undo(),
    }),
    { left: "18px", bottom: "56px" },
);
float(
    button({
        label: "↺ reset fur",
        hint: "restore the un-combed field",
        onClick: () => scene.resetField(),
    }),
    { left: "18px", bottom: "18px" },
);
