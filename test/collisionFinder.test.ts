/**
 * The fixed-point finder = topology (winding-transition bisection) +
 * analysis (damped Newton). Tested against maps with known fixed points,
 * self-consistency for maps without closed forms, and the degenerate cases
 * that must not fool it.
 */

import { describe, it, expect } from "vitest";
import {
    windingOfLoop,
    findWindingTransition,
    refineZero,
} from "../src/math/analysis/collisionFinder.ts";
import { findBrouwerFixedPoint } from "../src/math/proofs/brouwer.ts";
import { identityMap, radialContraction, swirlMap } from "../src/math/maps/diskMaps.ts";
import { vec2, set2 } from "../src/math/types.ts";

describe("windingOfLoop", () => {
    it("counts k for 0.5·e^{ikθ}", () => {
        for (const k of [-2, 1, 3]) {
            const w = windingOfLoop((theta, out) =>
                set2(out, 0.5 * Math.cos(k * theta), 0.5 * Math.sin(k * theta)),
            );
            expect(w.winding).toBe(k);
            expect(w.minRadius).toBeCloseTo(0.5, 6);
        }
    });

    it("is null for a loop passing through 0, and reports where", () => {
        const w = windingOfLoop((theta, out) =>
            set2(out, 0.3 * (1 - Math.cos(theta - 2)), 0.01 * Math.sin(theta - 2)),
        );
        expect(w.winding).toBeNull();
        expect(w.thetaAtMin).toBeCloseTo(2, 1);
    });
});

describe("findWindingTransition", () => {
    // model family: d(s, θ) = c + s·e^{iθ} — winding jumps 0 → 1 at s = |c|
    const c = { x: 0.3, y: 0.2 };
    const d = (s: number, theta: number, out: ReturnType<typeof vec2>) =>
        set2(out, c.x + s * Math.cos(theta), c.y + s * Math.sin(theta));

    it("brackets the jump tightly at s = |c|", () => {
        const { transition, seed } = findWindingTransition(d, [0.01, 1]);
        const sStar = Math.hypot(c.x, c.y);
        expect(transition).not.toBeNull();
        expect(transition!.windingBelow).toBe(0);
        expect(transition!.windingAbove).toBe(1);
        // the bracket localizes the SAMPLED transition, within O(δθ²) of
        // the true s* — containment up to that sampling tolerance
        expect(transition!.bracket[0]).toBeLessThanOrEqual(sStar + 1e-3);
        expect(transition!.bracket[1]).toBeGreaterThanOrEqual(sStar - 1e-3);
        expect(transition!.bracket[1] - transition!.bracket[0]).toBeLessThan(1e-3);
        // the best seed seen should already be near the collision
        expect(seed.residual).toBeLessThan(0.05);
    });

    it("returns transition = null but a usable seed when the winding never jumps", () => {
        // d = s·e^{iθ}: winding 1 for every s > 0, zero only in the s → 0 limit
        const dCone = (s: number, theta: number, out: ReturnType<typeof vec2>) =>
            set2(out, s * Math.cos(theta), s * Math.sin(theta));
        const { transition, seed } = findWindingTransition(dCone, [0.01, 1]);
        expect(transition).toBeNull();
        expect(seed.s).toBeCloseTo(0.01, 6); // global min of |d| is at the bottom
    });
});

describe("refineZero", () => {
    it("polishes a seed to machine precision", () => {
        const c = { x: 0.3, y: 0.2 };
        const d = (s: number, theta: number, out: ReturnType<typeof vec2>) =>
            set2(out, c.x + s * Math.cos(theta), c.y + s * Math.sin(theta));
        // zero at s = |c|, θ = arg(−c)
        const result = refineZero(d, { s: 0.4, theta: 3.5 }, { sClamp: [0, 1] });
        expect(result.converged).toBe(true);
        expect(result.residual).toBeLessThan(1e-11);
        expect(result.s).toBeCloseTo(Math.hypot(c.x, c.y), 9);
        expect(result.theta).toBeCloseTo(Math.PI + Math.atan2(c.y, c.x), 9);
    });
});

describe("findBrouwerFixedPoint", () => {
    it("recovers the exact fixed point of an affine contraction", () => {
        // an UNCLAMPED affine map (displacedContraction soft-clamps, which
        // perturbs the fixed point away from the naive closed form):
        // f(x) = a·x + c ⇒ x* = c/(1 − a) = (0.5, 0.25) exactly
        const affine = {
            id: "affine",
            name: "affine",
            params: {},
            evalDisk: (x: { x: number; y: number }, _t: number, out: { x: number; y: number }) => {
                out.x = 0.4 * x.x + 0.3;
                out.y = 0.4 * x.y + 0.15;
                return out;
            },
        };
        const fp = findBrouwerFixedPoint(affine);
        expect(fp.found).toBe(true);
        expect(fp.x.x).toBeCloseTo(0.5, 8);
        expect(fp.x.y).toBeCloseTo(0.25, 8);
        expect(fp.transition).not.toBeNull(); // localized by a genuine Lk jump
        expect(fp.transition!.windingBelow).toBe(0);
        expect(fp.transition!.windingAbove).toBe(1);
    });

    it("is self-consistent on the swirl map (no closed form)", () => {
        const f = swirlMap(0.75, 2.5, 0.25, 0.0);
        const fp = findBrouwerFixedPoint(f);
        expect(fp.found).toBe(true);
        // verify f(x*) = x* independently of the finder's own residual
        const out = vec2();
        f.evalDisk(fp.x, 0, out);
        expect(Math.hypot(out.x - fp.x.x, out.y - fp.x.y)).toBeLessThan(1e-8);
    });

    it("walks down to the center fixed point when there is no transition", () => {
        // f(x) = a·x fixes only 0; Lk = 1 for every r > 0, so no jump exists
        const fp = findBrouwerFixedPoint(radialContraction(0.5));
        expect(fp.found).toBe(true);
        expect(fp.r).toBeLessThan(1e-9);
        expect(fp.transition).toBeNull();
    });

    it("reports a zero residual immediately for the identity map", () => {
        // every point is fixed: d ≡ 0, the ultimate degenerate case
        const fp = findBrouwerFixedPoint(identityMap());
        expect(fp.residual).toBeLessThan(1e-11);
        expect(fp.found).toBe(true);
    });
});
