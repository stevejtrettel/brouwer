/**
 * Borsuk–Ulam theorem — WEBSITE entry: one idea, one motion. The φ slider
 * walks the latitude circles; blue Γ_f and violet Γ_f̄ bound the ribbon,
 * which is an untwisted band near the pole and a Möbius band at the
 * equator — an integer twist can only change by the curves touching, and a
 * touch means f(x) = f(−x). The gold dots on the sphere ALWAYS mark that
 * antipodal pair for the current map; ⊚ jumps to its latitude. The balloon
 * panel is sculptable by pointer alone. Everything else lives in the lab.
 */

import { buildBorsukScene } from "./scene.ts";
import { titleBlock, panelLabel, button, slider, float } from "../../src/ui/controls.ts";

const scene = buildBorsukScene({ mode: "story", meridian: false, thetaProbe: false });

const title = titleBlock({ title: "Borsuk–Ulam theorem" });
scene.hooks.afterRefresh = (s) => {
    title.status(s.status, s.tone);
    title.caption(s.caption);
};
scene.refresh();

const sphereLabel = panelLabel("", { top: "6px", left: "12px" });
sphereLabel.innerHTML =
    'domain S² — the latitude circle γ_φ · <b style="color:#ffb703">●</b> the antipodal pair f(x) = f(−x)';
const imageLabel = panelLabel("", { top: "calc(50% + 6px)", left: "12px" });
imageLabel.innerHTML =
    'image f(S²) — grab to sculpt · <b style="color:#2f6de1">—</b> f on γ_φ · <b style="color:#8d4fd3">—</b> f at the antipodes';

const phiSlider = float(
    slider({
        label: "latitude φ",
        min: 0.02,
        max: Math.PI / 2,
        step: Math.PI / 1000,
        value: scene.state.phi,
        vertical: true,
        onInput: (v) => scene.setPhi(v),
    }),
    { right: "22px", top: "50%" },
);
phiSlider.el.style.transform = "translateY(-50%)";
scene.hooks.onStateJump = (phi) => phiSlider.set(phi);

// under the slider: jump straight to the latitude where the pair lives
const pairBtn = float(
    button({
        label: "⊚ antipodal pair",
        hint: "jump φ to the latitude of the gold pair — the two curves touch there, because f takes the same value at x and −x",
        onClick: () => {
            const pair = scene.findPair();
            title.caption(
                pair
                    ? "jumped to the pair's latitude — the curves touch at the gold markers"
                    : "finder did not converge — degenerate map?",
            );
        },
    }),
    { right: "14px", top: "calc(50% + 158px)" },
);
pairBtn.el.style.fontSize = "12px";

float(
    button({
        label: "↺ reset",
        hint: "restore the un-sculpted map",
        onClick: () => scene.resetMap(),
    }),
    { left: "18px", bottom: "18px" },
);

