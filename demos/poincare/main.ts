/**
 * Poincaré / hairy-ball theorem — WEBSITE entry: minimal chrome. The φ
 * slider walks the latitudes (winding +1 near the north pole, −1 near the
 * south — the graph must cross the core between); ✂ comb mode hands the
 * sphere drag to the comb (Σ index reads 2 no matter what you do); ▶ sweep
 * plays pole → pole with ghost trails. Everything else lives in lab.html.
 */

import { buildPoincareScene } from "./scene.ts";
import { titleBlock, panelLabel, button, playButton, slider, toggle, float } from "../../src/ui/controls.ts";

const scene = buildPoincareScene({ mode: "story", meridian: false });

const title = titleBlock({ title: "Poincaré / hairy-ball theorem" });
scene.hooks.afterRefresh = (s) => {
    title.status(s.status, s.tone);
    title.caption(s.caption);
};
scene.refresh();

panelLabel("domain S² — the combed field v", { top: "6px", left: "12px" });
panelLabel("fiber disk — trace of p_γ", { top: "calc(50% + 6px)", left: "12px" });

const phiSlider = float(
    slider({
        label: "latitude φ",
        min: 0.05,
        max: Math.PI - 0.05,
        step: (Math.PI - 0.1) / 500,
        value: scene.state.phi,
        vertical: true,
        onInput: (v) => scene.setPhi(v),
    }),
    { right: "22px", top: "50%" },
);
phiSlider.el.style.transform = "translateY(-50%)";
scene.hooks.onSweepStep = (v) => phiSlider.set(v);

const sweepBtn = float(
    playButton({
        label: "▶ sweep φ",
        onToggle: () => sweepBtn.set(scene.sweepToggle()),
    }),
    { left: "18px", bottom: "18px" },
);
scene.hooks.onSweepEnd = () => sweepBtn.set(false);

float(
    toggle({
        label: "✂ comb the sphere",
        onChange: (on) => scene.setCombMode(on),
    }),
    { left: "126px", bottom: "18px" },
);

float(button({ label: "↺ reset field", onClick: () => scene.resetField() }), {
    left: "292px",
    bottom: "18px",
});
