/**
 * Disk map playground — WEBSITE entry: the sculpting experience with the
 * minimum of chrome. Grab the sheet and pull, drag a coral rim dot to fold;
 * gold/violet dots are the fixed points and Σ index = 1, always. Undo and
 * reset are the only buttons; everything else lives in lab.html.
 */

import { buildDiskScene } from "./scene.ts";
import { titleBlock, panelLabel, button, float } from "../../src/ui/controls.ts";

const scene = buildDiskScene();

const title = titleBlock({ title: "Disk map playground", left: "16px" });
title.status(
    "grab the sheet and pull · drag a coral rim dot to fold · gold/violet dots are fixed points",
);
scene.hooks.onMeters = (m) => {
    title.caption(`fixed points ${m.fixedPoints} · Σ index ${m.indexSum} · folds ${m.folds}`);
};
scene.census(); // re-fire the hook now that it's wired

panelLabel("domain D²", { top: "8px", left: "calc(25% - 30px)" });
panelLabel("image f(D²) — sculpt me", { top: "8px", left: "calc(75% - 60px)" });

float(button({ label: "⎌ undo", onClick: () => scene.sculptor.undo() }), {
    right: "116px",
    bottom: "18px",
});
float(button({ label: "↺ reset", onClick: () => scene.reset() }), {
    right: "18px",
    bottom: "18px",
});
