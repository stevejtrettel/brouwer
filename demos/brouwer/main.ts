/**
 * Brouwer fixed point theorem — WEBSITE entry: one idea, one motion.
 * The r slider walks the circles S_r and every frame is an honest graph of
 * f; the status line narrates unlinked → linked → touching, and the touch
 * IS the fixed point (◎ jumps straight to it). The image panel is
 * sculptable by pointer alone — the theorem survives any crumple. All the
 * machinery (sweeps, the linking-argument deformation, index colors) lives
 * in lab.html.
 */

import { buildBrouwerScene } from "./scene.ts";
import { titleBlock, panelLabel, button, slider, float } from "../../src/ui/controls.ts";

const scene = buildBrouwerScene({ mode: "story" });

const title = titleBlock({ title: "Brouwer fixed point theorem" });
scene.hooks.afterRefresh = (s) => {
    title.status(s.status, s.tone);
    title.caption(s.caption);
};
scene.refresh();

// panel labels, with the fixed-point legend spelled out
const imageLabel = panelLabel("", { top: "6px", left: "12px" });
imageLabel.innerHTML =
    'image f(D²) — grab &amp; fold to sculpt · <b style="color:#ffb703">●</b> fixed points of f';
const domainLabel = panelLabel("", { top: "calc(50% + 6px)", left: "12px" });
domainLabel.innerHTML =
    'domain D² — <b style="color:#ffb703">●</b> the same fixed points: f(x) = x, marked in both panels';

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
    { right: "22px", top: "50%" },
);
rSlider.el.style.transform = "translateY(-50%)";
scene.hooks.onSweepStep = (r) => rSlider.set(r); // push sets r = 1 through this

// under the slider: jump straight to a circle where the curves touch
const snapBtn = float(
    button({
        label: "◎ fixed point",
        hint: "jump r to the next circle S_r that passes through a fixed point — the graphs touch there (cycles through all of them)",
        onClick: () => {
            const r = scene.snapToFixedPoint();
            if (r !== null) rSlider.set(r);
        },
    }),
    { right: "14px", top: "calc(50% + 158px)" },
);
snapBtn.el.style.fontSize = "12px";

// the sheet reset belongs with the panels it clears (bottom left)
float(
    button({
        label: "↺ reset sheet",
        hint: "flatten the crumple back to the identity map",
        onClick: () => scene.reset(),
    }),
    { left: "18px", bottom: "18px" },
);
