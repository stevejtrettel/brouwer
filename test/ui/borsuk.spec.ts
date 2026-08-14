/**
 * Borsuk–Ulam: the sculptable balloon. The point of letting a visitor maul the
 * map is that the theorem does not care — so the test is not just "sculpting
 * works" but "the antipodal pair is still there afterwards", which is the claim
 * the demo makes on screen.
 *
 * The balloon panel is the BOTTOM-LEFT third (image rect {x:0, y:0, w:1/3,
 * h:0.5} in bottom-left-origin fractions); the torus is the right two thirds.
 */

import { afterAll, describe, expect, it } from "vitest";
import { MOVED, PANEL, STILL, centre, closeBrowser, diffFraction, openDemo } from "./harness.ts";

afterAll(closeBrowser);

const BALLOON = centre(PANEL.panelBottomLeft);
const TORUS = centre(PANEL.torusWide);

describe("borsuk (website)", () => {
    it("sculpts the balloon on a left-drag, and the curves follow", async () => {
        const demo = await openDemo("borsuk");
        try {
            const balloonBefore = await demo.shot(PANEL.panelBottomLeft);
            const torusBefore = await demo.shot(PANEL.torusWide);

            await demo.drag(BALLOON, { x: BALLOON.x + 70, y: BALLOON.y - 40 });

            expect(
                diffFraction(balloonBefore, await demo.shot(PANEL.panelBottomLeft)),
                "the balloon did not deform — is the sculptor attached?",
            ).toBeGreaterThan(MOVED);
            expect(
                diffFraction(torusBefore, await demo.shot(PANEL.torusWide)),
                "sculpting the map did not move Γ_f in the torus",
            ).toBeGreaterThan(MOVED);
            expect(demo.errors).toEqual([]);
        } finally {
            await demo.close();
        }
    });

    it("ignores a right-drag on the balloon", async () => {
        const demo = await openDemo("borsuk");
        try {
            const before = await demo.shot(PANEL.panelBottomLeft);
            await demo.drag(BALLOON, { x: BALLOON.x + 70, y: BALLOON.y - 40 }, { button: "right" });
            expect(
                diffFraction(before, await demo.shot(PANEL.panelBottomLeft)),
                "the secondary button sculpted the sheet",
            ).toBeLessThan(STILL);
        } finally {
            await demo.close();
        }
    });

    it("still finds f(x) = f(−x) after the map has been mauled", async () => {
        const demo = await openDemo("borsuk");
        try {
            await demo.drag(BALLOON, { x: BALLOON.x + 80, y: BALLOON.y - 50 });
            await demo.drag({ x: BALLOON.x - 40, y: BALLOON.y + 30 }, { x: BALLOON.x + 20, y: BALLOON.y + 60 });

            await demo.page.locator("button", { hasText: "antipodal pair" }).click();
            await demo.page.waitForTimeout(2000);

            // the demo writes one of two captions; the finder must not give up
            expect(await demo.caption()).toContain("jumped to the pair");
            expect(demo.errors).toEqual([]);
        } finally {
            await demo.close();
        }
    });

    it("↺ reset restores the un-sculpted map", async () => {
        const demo = await openDemo("borsuk");
        try {
            const pristine = await demo.shot(PANEL.panelBottomLeft);
            await demo.drag(BALLOON, { x: BALLOON.x + 70, y: BALLOON.y - 40 });
            expect(diffFraction(pristine, await demo.shot(PANEL.panelBottomLeft))).toBeGreaterThan(MOVED);

            await demo.page.locator("button", { hasText: "reset" }).click();
            await demo.page.waitForTimeout(1500);
            expect(diffFraction(pristine, await demo.shot(PANEL.panelBottomLeft))).toBeLessThan(STILL);
        } finally {
            await demo.close();
        }
    });

    it("does not sculpt from a drag on the torus panel", async () => {
        const demo = await openDemo("borsuk");
        try {
            const before = await demo.shot(PANEL.panelBottomLeft);
            await demo.drag(TORUS, { x: TORUS.x + 120, y: TORUS.y + 60 });
            expect(diffFraction(before, await demo.shot(PANEL.panelBottomLeft))).toBeLessThan(STILL);
        } finally {
            await demo.close();
        }
    });
});
