import { describe, it, expect } from "vitest";
import { wrapToPi, unwrapAngles } from "../src/math/analysis/unwrap.ts";
import { windingNumber, relativeWinding } from "../src/math/analysis/winding.ts";
import { closestApproach, closestCoreApproach } from "../src/math/analysis/collisions.ts";
import { sampleGraphCurve } from "../src/math/graphCurve.ts";
import { set2 } from "../src/math/types.ts";

const N = 256;

describe("unwrap", () => {
    it("wraps differences into (−π, π]", () => {
        expect(wrapToPi(0.1)).toBeCloseTo(0.1);
        expect(wrapToPi(2 * Math.PI + 0.1)).toBeCloseTo(0.1);
        expect(wrapToPi(-2 * Math.PI - 0.1)).toBeCloseTo(-0.1);
        expect(wrapToPi(Math.PI)).toBeCloseTo(Math.PI);
    });

    it("removes 2π jumps", () => {
        // a steadily increasing angle recorded mod 2π
        const raw = new Float32Array(100);
        for (let i = 0; i < 100; i++) raw[i] = (0.3 * i) % (2 * Math.PI);
        const un = unwrapAngles(raw);
        for (let i = 1; i < 100; i++) {
            expect(un[i]! - un[i - 1]!).toBeCloseTo(0.3, 5);
        }
    });
});

describe("windingNumber", () => {
    it("counts k for p(θ) = 0.5·e^{ikθ}", () => {
        for (const k of [-2, -1, 1, 3]) {
            const curve = sampleGraphCurve(
                (theta, out) =>
                    set2(out, 0.5 * Math.cos(k * theta), 0.5 * Math.sin(k * theta)),
                N,
                "map",
            );
            expect(windingNumber(curve)).toBeCloseTo(k, 6);
        }
    });

    it("is 0 for a loop not enclosing the origin", () => {
        const curve = sampleGraphCurve(
            (theta, out) =>
                set2(out, 0.6 + 0.2 * Math.cos(theta), 0.2 * Math.sin(theta)),
            N,
            "map",
        );
        expect(windingNumber(curve)).toBeCloseTo(0, 6);
    });
});

describe("relativeWinding", () => {
    it("measures the twist of b around a", () => {
        const a = sampleGraphCurve((_, out) => set2(out, 0.1, 0), N, "map");
        const b = sampleGraphCurve(
            (theta, out) =>
                set2(out, 0.1 + 0.3 * Math.cos(theta), 0.3 * Math.sin(theta)),
            N,
            "antipodal-map",
        );
        expect(relativeWinding(b, a)).toBeCloseTo(1, 6);
    });
});

describe("collisions", () => {
    it("finds the same-θ closest approach", () => {
        const a = sampleGraphCurve(
            (theta, out) => set2(out, 0.5 * Math.cos(theta), 0.5 * Math.sin(theta)),
            N,
            "identity",
        );
        // an inner circle that reaches out and touches a near θ = π
        const b = sampleGraphCurve(
            (theta, out) => {
                const s = 0.1 + 0.4 * Math.exp(-4 * (theta - Math.PI) ** 2);
                set2(out, s * Math.cos(theta), s * Math.sin(theta));
            },
            N,
            "map",
        );
        const hit = closestApproach(a, b);
        expect(hit.theta).toBeCloseTo(Math.PI, 1);
        expect(hit.distance).toBeCloseTo(0, 2);
    });

    it("finds the closest core approach", () => {
        const c = sampleGraphCurve(
            (theta, out) =>
                set2(out, 0.3 + 0.25 * Math.cos(theta), 0.25 * Math.sin(theta)),
            N,
            "vector-field",
        );
        const hit = closestCoreApproach(c);
        expect(hit.distance).toBeCloseTo(0.05, 6);
        expect(hit.theta).toBeCloseTo(Math.PI, 1);
    });
});
