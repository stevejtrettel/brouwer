/**
 * The Poincaré website entry: combing the fur and turning the sphere share one
 * panel, split by button. This is the wiring that broke twice — once because the
 * scene's comb-mode gate switched orbit off wholesale, once because the gate went
 * stale between a stroke ending and the next press — and neither failure was
 * visible to any unit test.
 *
 * No test hook is involved. The discriminator is which PANEL changes:
 *   combing  edits the field → the graph curve is refilled → the TORUS panel moves;
 *   orbiting moves the sphere camera only → the torus panel stays put.
 */

import { afterAll, describe, expect, it } from "vitest";
import {
    MOVED,
    PANEL,
    STILL,
    centre,
    closeBrowser,
    diffFraction,
    openDemo,
    settled,
} from "./harness.ts";
import type { DemoPage } from "./harness.ts";

afterAll(closeBrowser);

const SPHERE = centre(PANEL.sphereTopLeft);
const TORUS = centre(PANEL.torusWide);
const from = (dx: number, dy: number) => ({ x: SPHERE.x + dx, y: SPHERE.y + dy });

/**
 * Comb once and let everything settle. The website sphere auto-rotates as an
 * invitation until the first stroke, so this is also how a test gets a STILL
 * sphere to measure against.
 */
async function combAndSettle(demo: DemoPage): Promise<void> {
    await demo.drag(SPHERE, from(60, 30));
    // and wait for the sphere to actually stop: the auto-rotate leaves damping
    // creep that outlives any fixed delay
    await settled(demo, PANEL.sphereTopLeft);
}

describe("poincare (website)", () => {
    it("combs the field on a left-drag", async () => {
        const demo = await openDemo("poincare");
        try {
            const before = await demo.shot(PANEL.torusWide);
            await demo.drag(SPHERE, from(90, 45));
            expect(
                diffFraction(before, await demo.shot(PANEL.torusWide)),
                "left-drag on the sphere never reached the graph curve — is combing enabled?",
            ).toBeGreaterThan(MOVED);
            expect(demo.errors).toEqual([]);
        } finally {
            await demo.close();
        }
    });

    it("orbits on a right-drag without touching the field", async () => {
        const demo = await openDemo("poincare");
        try {
            await combAndSettle(demo);
            const sphereBefore = await demo.shot(PANEL.sphereTopLeft);
            const torusBefore = await demo.shot(PANEL.torusWide);

            await demo.drag(SPHERE, from(140, 20), { button: "right" });

            expect(
                diffFraction(sphereBefore, await demo.shot(PANEL.sphereTopLeft)),
                "right-drag did not orbit the sphere",
            ).toBeGreaterThan(MOVED);
            expect(
                diffFraction(torusBefore, await demo.shot(PANEL.torusWide)),
                "right-drag changed the field — it combed instead of orbiting",
            ).toBeLessThan(STILL);
        } finally {
            await demo.close();
        }
    });

    // REGRESSION: the gate that re-opens orbit when a stroke ends used to be
    // refreshed on pointermove only, so pressing straight after a comb — mouse
    // perfectly still — was swallowed and the sphere would not turn.
    it("orbits on a right-press with no pointer movement after a stroke", async () => {
        const demo = await openDemo("poincare");
        try {
            await combAndSettle(demo);
            const before = await demo.shot(PANEL.sphereTopLeft);
            await demo.drag(from(60, 30), from(180, 40), { button: "right", press: true });
            expect(diffFraction(before, await demo.shot(PANEL.sphereTopLeft))).toBeGreaterThan(MOVED);
        } finally {
            await demo.close();
        }
    });

    it("does not comb from a drag on the torus panel", async () => {
        const demo = await openDemo("poincare");
        try {
            await combAndSettle(demo);
            const sphereBefore = await settled(demo, PANEL.sphereTopLeft);
            await demo.drag(TORUS, { x: TORUS.x + 120, y: TORUS.y + 60 });
            expect(
                diffFraction(sphereBefore, await demo.shot(PANEL.sphereTopLeft)),
                "dragging the torus edited the field",
            ).toBeLessThan(STILL);
        } finally {
            await demo.close();
        }
    });

    it("↺ reset fur puts the field back exactly", async () => {
        const demo = await openDemo("poincare");
        try {
            await combAndSettle(demo);
            await demo.page.locator("button", { hasText: "reset fur" }).click();
            await demo.page.waitForTimeout(1500);
            const pristine = await demo.shot(PANEL.torusWide);

            await demo.drag(SPHERE, from(100, 60));
            expect(diffFraction(pristine, await demo.shot(PANEL.torusWide))).toBeGreaterThan(MOVED);

            await demo.page.locator("button", { hasText: "reset fur" }).click();
            await demo.page.waitForTimeout(1500);
            expect(diffFraction(pristine, await demo.shot(PANEL.torusWide))).toBeLessThan(STILL);
        } finally {
            await demo.close();
        }
    });

    it("⎌ undo takes back the last stroke", async () => {
        const demo = await openDemo("poincare");
        try {
            await combAndSettle(demo);
            const afterFirst = await demo.shot(PANEL.torusWide);
            await demo.drag(SPHERE, from(-60, 50));
            expect(diffFraction(afterFirst, await demo.shot(PANEL.torusWide))).toBeGreaterThan(MOVED);

            await demo.page.locator("button", { hasText: "undo" }).click();
            await demo.page.waitForTimeout(1500);
            expect(diffFraction(afterFirst, await demo.shot(PANEL.torusWide))).toBeLessThan(STILL);
        } finally {
            await demo.close();
        }
    });
});

describe("poincare-lab (modal comb)", () => {
    it("combs while comb mode is on, and Σ index stays 2 afterwards", async () => {
        const demo = await openDemo("poincare-lab");
        try {
            expect(await demo.meter("Σ index")).toContain("2 = χ(S²)");
            const torusBefore = await demo.shot(PANEL.torusWide);

            await demo.drag(SPHERE, from(90, 50));

            expect(
                diffFraction(torusBefore, await demo.shot(PANEL.torusWide)),
                "comb mode is on but the drag never edited the field",
            ).toBeGreaterThan(MOVED);
            // the invariant the demo stakes its claim on: no amount of combing
            // can cancel the zeros. A census that loses a ±1 pair reports 1.
            expect(await demo.meter("Σ index")).toContain("2 = χ(S²)");
            expect(demo.errors).toEqual([]);
        } finally {
            await demo.close();
        }
    });

    it("orbits instead of combing once comb mode is switched off", async () => {
        const demo = await openDemo("poincare-lab");
        try {
            await demo.page.locator("button", { hasText: "comb mode" }).click(); // → off
            await demo.page.waitForTimeout(400);
            const torusBefore = await demo.shot(PANEL.torusWide);
            const sphereBefore = await demo.shot(PANEL.sphereTopLeft);

            await demo.drag(SPHERE, from(90, 50));

            expect(
                diffFraction(torusBefore, await demo.shot(PANEL.torusWide)),
                "comb mode is off but the drag still combed",
            ).toBeLessThan(STILL);
            expect(
                diffFraction(sphereBefore, await demo.shot(PANEL.sphereTopLeft)),
                "comb mode is off so the drag should have orbited the sphere",
            ).toBeGreaterThan(MOVED);
        } finally {
            await demo.close();
        }
    });
});
