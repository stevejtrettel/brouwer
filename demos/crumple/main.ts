/**
 * Fold a map, save it — the figure-authoring tool for disk maps.
 *
 * This is not a demo. It exists because the figures need a SPECIFIC crumple
 * (one whose fixed point is where the argument wants it, one whose folds read
 * in a render), and picking one by editing coefficients in bakedCrumple.ts is
 * not a way to choose a picture. So: fold it by hand, name it, save it, and
 * point a figure at the name.
 *
 * A saved crumple is positions AND fold layers together — see
 * src/math/maps/crumple.ts for why neither is any use without the other.
 *
 * Layout: the disks own the window and the controls sit in a rail beside them,
 * because the right-hand disk is the one you edit and a panel floating over it
 * makes the tool unusable. The viewports are narrowed to leave the rail clear
 * rather than drawn full-width and covered.
 */

import { buildDiskScene } from "../disk/scene.ts";
import { loadCrumple, saveCrumple } from "../../src/math/maps/crumple.ts";
import { titleBlock, panelLabel, button, slider, readout, stack } from "../../src/ui/controls.ts";
import { findAllFixedPoints } from "../../src/math/proofs/brouwer.ts";
import { vec2, set2 } from "../../src/math/types.ts";

const scene = buildDiskScene();

// Keep the disks out from under the control rail. The rail is RAIL_PX wide; the
// two panels split what is left, so nothing ever sits beneath a slider.
const RAIL_PX = 300;
function layout(): void {
    const free = Math.max(0.3, 1 - RAIL_PX / window.innerWidth);
    scene.domain.viewport.rect = { x: 0, y: 0, w: free / 2, h: 1 };
    scene.image.viewport.rect = { x: free / 2, y: 0, w: free / 2, h: 1 };
    scene.app.views.resize(window.innerWidth, window.innerHeight);
}
layout();
window.addEventListener("resize", layout);

const title = titleBlock({ title: "Fold a map", left: "16px" });
title.status("drag a coral rim dot to crease · drag inside to pull · then name it and save");

panelLabel("domain D²", { top: "8px", left: "calc(20% - 30px)" });
panelLabel("image f(D²) — edit here", { top: "8px", left: "calc(58% - 60px)" });

const controls = stack({ anchor: "top-right", width: RAIL_PX - 24 });

controls.add(
    slider({
        label: "brush size σ",
        min: 0.1,
        max: 0.8,
        step: 0.01,
        value: scene.brush.sigma,
        onInput: (v) => (scene.brush.sigma = v),
    }),
    button({ label: "⎌ undo", onClick: () => scene.sculptor.undo() }),
    button({ label: "↺ start over", onClick: () => scene.reset() }),
);

const meters = controls.group("what you have made");
const foldsOut = readout({ label: "folds" });
const fixedOut = readout({ label: "fixed points" });
meters.add(foldsOut, fixedOut);

// ------------------------------------------------- is this a good Figure 3?
//
// Figure 3 sweeps r from 0 to 1 and needs the pair of graphs to go from
// plainly unlinked to plainly linked, with the crossing somewhere you can see
// it. Two numbers decide whether a map can do that, and both are cheap:
//
//   |f(0)|   near the centre f is almost constant, so Γ_f sits near the
//            constant curve at f(0) while Γ_i is a small loop around the core.
//            They are unlinked when those are far apart, and start life almost
//            on top of each other when f(0) ≈ 0. Want ≳ 0.4.
//
//   r*       the radius of the fixed point, which IS the radius at which the
//            two curves meet. Want it near the middle — too small and panel
//            (a) is already linked, too near 1 and the sweep resolves in the
//            last instant.
//
// Shown live while you fold, because otherwise choosing a map means saving it,
// loading a figure, and squinting.
const fitness = controls.group("figure 3 fitness");
const originOut = readout({ label: "|f(0)|  want ≳ 0.4" });
const radiusOut = readout({ label: "crossing at r  want .4–.7" });
const verdictOut = readout({ label: "" });
fitness.add(originOut, radiusOut, verdictOut);

const scratch = vec2();
function judge(): void {
    set2(scratch, 0, 0);
    scene.map.evalDisk(scratch, 0, scratch);
    const origin = Math.hypot(scratch.x, scratch.y);
    originOut.set(origin.toFixed(3));

    const census = findAllFixedPoints(scene.map, 0, { minDepth: 4 });
    if (census.degenerate) {
        radiusOut.set("— (f ≈ id on a region)");
        verdictOut.set("fold it more");
        return;
    }
    const radii = census.fixedPoints
        .map((fp) => fp.r)
        .sort((a, b) => a - b);
    if (!radii.length) {
        radiusOut.set("none found");
        verdictOut.set("keep folding");
        return;
    }
    radiusOut.set(radii.map((r) => r.toFixed(2)).join(", "));
    const r = radii[0]!;
    verdictOut.set(
        origin < 0.35
            ? "centre barely moves — the two curves start on top of each other"
            : r < 0.35
              ? "crossing too early — panel (a) will already be linked"
              : r > 0.85
                ? "crossing too late — the sweep resolves at the very end"
                : "good — unlinked at small r, linked at r = 1",
    );
}

scene.hooks.onMeters = (m) => {
    foldsOut.set(m.folds);
    fixedOut.set(m.fixedPoints);
    judge();
};
scene.census();

// ------------------------------------------------------------------ saving
const saveGroup = controls.group("save this map");
const nameInput = document.createElement("input");
nameInput.type = "text";
nameInput.spellcheck = false;
nameInput.placeholder = "name, e.g. fig3";
nameInput.value = new URLSearchParams(location.search).get("crumple") ?? "";
Object.assign(nameInput.style, {
    width: "100%",
    padding: "6px 9px",
    borderRadius: "8px",
    border: "1px solid rgba(0,0,0,0.18)",
    font: "inherit",
    background: "#fff",
    color: "inherit",
});
saveGroup.add({ el: nameInput });

const status = readout({ label: "" });
const named = (): string | null => {
    const name = nameInput.value.trim().replace(/[^\w-]/g, "-");
    if (!name) status.set("give it a name first");
    return name || null;
};

saveGroup.add(
    button({
        label: "⤓ save map",
        onClick: () => {
            const name = named();
            if (!name) return;
            void saveCrumple(name, scene.grid, scene.toCrumple()).then((ok) =>
                status.set(ok ? `saved → crumples/${name}.json` : "save failed — restart the server"),
            );
        },
    }),
    button({
        label: "⤒ load map",
        onClick: () => {
            const name = named();
            if (!name) return;
            void loadCrumple(name, scene.grid)
                .then((crumple) => {
                    if (!crumple) return status.set(`no crumples/${name}.json`);
                    scene.applyCrumple(crumple);
                    status.set(`loaded ${name}`);
                })
                .catch((error: unknown) => status.set(String(error)));
        },
    }),
    status,
);

// ?crumple=<name> opens on a saved map, so one can be picked up and worked on
{
    const wanted = new URLSearchParams(location.search).get("crumple");
    if (wanted) {
        void loadCrumple(wanted, scene.grid).then((crumple) => {
            if (crumple) {
                scene.applyCrumple(crumple);
                status.set(`loaded ${wanted}`);
            }
        });
    }
}
