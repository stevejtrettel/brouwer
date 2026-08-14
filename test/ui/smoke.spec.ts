/**
 * Does each demo still come up? The cheapest test that would have caught every
 * "black screen" regression the roadmap records — a missing uv attribute, a
 * clearcoat material, a scene that throws before it renders.
 */

import { afterAll, describe, expect, it } from "vitest";
import { PANEL, closeBrowser, looksRendered, openDemo } from "./harness.ts";

afterAll(closeBrowser);

/** Each story demo with the panels its layout actually fills. */
const DEMOS: { name: string; panels: (keyof typeof PANEL)[] }[] = [
    { name: "graphs", panels: ["torusWide"] },
    { name: "brouwer", panels: ["torusWide", "sphereTopLeft", "panelBottomLeft"] },
    { name: "borsuk", panels: ["torusWide", "sphereTopLeft", "panelBottomLeft"] },
    { name: "poincare", panels: ["torusWide", "sphereTopLeft", "panelBottomLeft"] },
    { name: "disk", panels: ["panelBottomLeft"] },
];

describe.each(DEMOS)("$name", ({ name, panels }) => {
    it("loads clean and renders every panel", async () => {
        const demo = await openDemo(name);
        try {
            expect(demo.errors).toEqual([]);
            for (const panel of panels) {
                expect(
                    looksRendered(await demo.shot(PANEL[panel])),
                    `${name}: ${panel} looks blank`,
                ).toBe(true);
            }
            expect(await demo.status()).not.toBe("");
        } finally {
            await demo.close();
        }
    });
});

// The pixel-ratio viewport bug this replaces a standalone script for: scissor
// rects are set in CSS pixels and three multiplies by the device pixel ratio
// itself, so a retina viewport is where double-applied ratios show up.
it("renders correctly at deviceScaleFactor 2", async () => {
    const demo = await openDemo("poincare", { deviceScaleFactor: 2 });
    try {
        expect(demo.errors).toEqual([]);
        expect(looksRendered(await demo.shot(PANEL.torusWide))).toBe(true);
        expect(looksRendered(await demo.shot(PANEL.sphereTopLeft))).toBe(true);
        expect(looksRendered(await demo.shot(PANEL.panelBottomLeft))).toBe(true);
    } finally {
        await demo.close();
    }
});
