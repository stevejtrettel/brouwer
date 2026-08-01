/**
 * Linking-number tests.
 *
 * The load-bearing one is the Gauss cross-check: the fiberwise winding and
 * the extrinsic Gauss integral are computed by completely independent
 * methods (2D angle unwrapping vs a 3D double integral over the embedded
 * curves), so their agreement — up to the sign flip forced by our
 * left-handed (θ, u, v) embedding — validates both at once.
 */

import { describe, it, expect } from "vitest";
import { linkingNumber, gaussLinkingNumber } from "../src/math/analysis/linking.ts";
import { sampleGraphCurve } from "../src/math/graphCurve.ts";
import { SolidTorus } from "../src/math/torus.ts";
import { set2 } from "../src/math/types.ts";
import { identityLoop, mapLoop } from "../src/math/proofs/brouwer.ts";
import { displacedContraction, swirlMap } from "../src/math/maps/diskMaps.ts";
import type { DiskMap } from "../src/math/maps/diskMaps.ts";

const N = 512;
const torus = new SolidTorus();

const core = sampleGraphCurve((_t, out) => set2(out, 0, 0), N, "core");

function torusKnot(k: number, radius = 0.5, cx = 0, cy = 0) {
    // a (1, k)-curve: winds k times around the core per trip around S¹
    return sampleGraphCurve(
        (theta, out) =>
            set2(out, cx + radius * Math.cos(k * theta), cy + radius * Math.sin(k * theta)),
        N,
        "map",
    );
}

describe("linkingNumber (fiberwise)", () => {
    it("constant parallel sections are unlinked", () => {
        const a = sampleGraphCurve((_t, out) => set2(out, 0.5, 0), N, "map");
        const b = sampleGraphCurve((_t, out) => set2(out, -0.4, 0.2), N, "identity");
        expect(linkingNumber(a, b).lk).toBe(0);
    });

    it("the (1, k)-curve links the core k times", () => {
        for (const k of [-2, -1, 1, 3]) {
            expect(linkingNumber(torusKnot(k), core).lk).toBe(k);
        }
    });

    it("is symmetric", () => {
        const a = torusKnot(1, 0.5);
        expect(linkingNumber(a, core).lk).toBe(linkingNumber(core, a).lk);
    });

    it("returns null when the curves touch", () => {
        const a = sampleGraphCurve((_t, out) => set2(out, 0.5, 0), N, "map");
        const b = sampleGraphCurve(
            // touches a at θ = 0
            (theta, out) => set2(out, 0.5 - 0.4 * (1 - Math.cos(theta)), 0),
            N,
            "identity",
        );
        expect(linkingNumber(a, b).lk).toBeNull();
        expect(linkingNumber(a, b).separation).toBeLessThan(1e-3);
    });
});

describe("Gauss integral cross-check", () => {
    // our y-up embedding is a left-handed (θ,u,v) frame, so the extrinsic
    // right-handed Gauss linking number is the NEGATIVE of the fiber winding
    it("gauss = −(fiber winding) for (1,k)-curves around the core", () => {
        for (const k of [-1, 1, 2]) {
            const knot = torusKnot(k);
            const gauss = gaussLinkingNumber(knot, core, torus);
            expect(gauss).toBeCloseTo(-k, 1);
        }
    });

    it("gauss ≈ 0 for parallel constant sections", () => {
        const a = sampleGraphCurve((_t, out) => set2(out, 0.5, 0), N, "map");
        const b = sampleGraphCurve((_t, out) => set2(out, -0.4, 0.2), N, "identity");
        expect(gaussLinkingNumber(a, b, torus)).toBeCloseTo(0, 1);
    });

    it("agrees on an off-center, wobbly pair", () => {
        const a = torusKnot(1, 0.35, 0.2, -0.1);
        const b = sampleGraphCurve(
            (theta, out) => set2(out, 0.2 + 0.05 * Math.sin(3 * theta), -0.1),
            N,
            "identity",
        );
        const fiber = linkingNumber(a, b);
        const gauss = gaussLinkingNumber(a, b, torus);
        expect(fiber.lk).not.toBeNull();
        expect(gauss).toBeCloseTo(-fiber.lk!, 1);
    });
});

describe("Brouwer linking narrative", () => {
    function curvesAt(f: DiskMap, r: number) {
        return [
            sampleGraphCurve(identityLoop(r).loop, N, "identity"),
            sampleGraphCurve(mapLoop(f, r).loop, N, "map"),
        ] as const;
    }

    it("small r: unlinked (displacement ≈ f(0) is nearly constant)", () => {
        for (const f of [displacedContraction(0.55, 0.3, 0.15), swirlMap()]) {
            const [gi, gf] = curvesAt(f, 0.02);
            expect(linkingNumber(gf, gi).lk).toBe(0);
        }
    });

    it("r = 1: linked once, for ANY map without boundary fixed points (Poincaré–Bohl)", () => {
        for (const f of [displacedContraction(0.55, 0.3, 0.15), swirlMap()]) {
            const [gi, gf] = curvesAt(f, 1);
            expect(linkingNumber(gf, gi).lk).toBe(1);
        }
    });

    it("linking flips from unlinked (small r) to linked once (r = 1)", () => {
        const f = displacedContraction(0.55, 0.3, 0.15);
        const [giS, gfS] = curvesAt(f, 0.02);
        const [giF, gfF] = curvesAt(f, 1);
        expect(linkingNumber(gfS, giS).lk).toBe(0);
        expect(linkingNumber(gfF, giF).lk).toBe(1);
    });
});
