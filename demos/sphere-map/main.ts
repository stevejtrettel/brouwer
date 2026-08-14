/**
 * Crush a sphere into the disk, save it — the figure-authoring tool for
 * S² → D² maps.
 *
 * The Borsuk figures need a specific map: one whose image is visibly crushed
 * (so the picture reads as "the sphere flattened"), and whose antipodal
 * coincidence sits somewhere the figure can point at. Editing coefficients is
 * not a way to choose a picture, so: brush it by hand, name it, save it, and
 * point a figure at the name.
 *
 * The sibling of /d/crumple/, and it saves through the same endpoint into the
 * same crumples/ directory. The files are distinguished by a `kind` field, and
 * loading one into the wrong kind of scene is a hard error rather than a
 * resample — the vertex indices are the correspondence.
 *
 * NO FOLD LAYERS here, unlike the disk tool: the sphere sculptor has no crease
 * gesture (`gripVertices: []`), so the map is brushed only and there are no
 * stacked flaps to record.
 *
 * Layout: sphere on the left, its flattened image on the right, controls in a
 * rail beside them — the image panel is the one you edit, so nothing floats
 * over it.
 */

import { buildBorsukScene } from "../borsuk/scene.ts";
import { loadSphereCrumple, saveSphereCrumple } from "../../src/math/maps/crumple.ts";
import { titleBlock, panelLabel, button, slider, readout, stack } from "../../src/ui/controls.ts";

const scene = buildBorsukScene({ mode: "story", meridian: false, thetaProbe: false });

const RAIL_PX = 300;
function layout(): void {
    const free = Math.max(0.3, 1 - RAIL_PX / window.innerWidth);
    // sphere left, flattened image right — the same left-to-right reading order
    // as the disk tool and as Figure 1
    scene.sphere.viewport.rect = { x: 0, y: 0, w: free / 2, h: 1 };
    if (scene.imagePanel) scene.imagePanel.rect = { x: free / 2, y: 0, w: free / 2, h: 1 };
    // the torus is not part of this job; park it off-canvas
    scene.torusView.viewport.rect = { x: 2, y: 2, w: 0.001, h: 0.001 };
    scene.app.views.resize(window.innerWidth, window.innerHeight);
}
layout();
window.addEventListener("resize", layout);

const title = titleBlock({ title: "Crush a sphere", left: "16px" });
title.status("drag on the right panel to push the image around · then name it and save");

panelLabel("domain S²", { top: "8px", left: "calc(20% - 30px)" });
panelLabel("image f(S²) ⊂ D² — edit here", { top: "8px", left: "calc(58% - 70px)" });

const controls = stack({ anchor: "top-right", width: RAIL_PX - 24 });

controls.add(
    slider({
        label: "latitude φ",
        min: 0.05,
        max: Math.PI / 2,
        step: 0.005,
        value: scene.state.phi,
        onInput: (v) => scene.setPhi(v),
    }),
);

if (scene.sculptor) {
    controls.add(
        slider({
            label: "brush size σ",
            min: 0.1,
            max: 0.8,
            step: 0.01,
            value: scene.sculptor.brush.sigma,
            onInput: (v) => (scene.sculptor!.brush.sigma = v),
        }),
        button({ label: "⎌ undo", onClick: () => scene.sculptor!.undo() }),
    );
}
controls.add(button({ label: "↺ start over", onClick: () => scene.resetMap() }));

// ------------------------------------------------- is this a good Borsuk map?
//
// The figure wants the two graphs to be plainly apart near the pole and plainly
// tangled at the equator, and the antipodal coincidence to be findable. The
// scene already computes both facts for its own status line, so the tool just
// surfaces them while you brush.
const meters = controls.group("what you have made");
const distOut = readout({ label: "closest approach" });
const twistOut = readout({ label: "twist" });
meters.add(distOut, twistOut);
scene.hooks.afterRefresh = (status) => {
    distOut.set(status.meters.minDist);
    twistOut.set(status.meters.twist);
};

controls.add(
    button({
        label: "◎ find the antipodal pair",
        onClick: () => {
            const pair = scene.findPair();
            if (!pair) distOut.set("no pair found — brush it more");
        },
    }),
);

// ------------------------------------------------------------------ saving
const saveGroup = controls.group("save this map");
const nameInput = document.createElement("input");
nameInput.type = "text";
nameInput.spellcheck = false;
nameInput.placeholder = "name, e.g. borsuk";
nameInput.value = new URLSearchParams(location.search).get("map") ?? "";
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
            void saveSphereCrumple(name, scene.f.grid, {
                positions: Float32Array.from(scene.f.positions),
            }).then((ok) =>
                status.set(ok ? `saved → crumples/${name}.json` : "save failed — restart the server"),
            );
        },
    }),
    button({
        label: "⤒ load map",
        onClick: () => {
            const name = named();
            if (!name) return;
            void loadSphereCrumple(name, scene.f.grid)
                .then((map) => {
                    if (!map) return status.set(`no crumples/${name}.json`);
                    scene.f.positions.set(map.positions);
                    scene.refresh();
                    status.set(`loaded ${name}`);
                })
                .catch((error: unknown) => status.set(String(error)));
        },
    }),
    status,
);

// ?map=<name> opens on a saved one, so it can be picked up and worked on
{
    const wanted = new URLSearchParams(location.search).get("map");
    if (wanted) {
        void loadSphereCrumple(wanted, scene.f.grid).then((map) => {
            if (map) {
                scene.f.positions.set(map.positions);
                scene.refresh();
                status.set(`loaded ${wanted}`);
            }
        });
    }
}
