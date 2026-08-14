/**
 * The Poincaré orientation convention (math spec §4.2):
 * with a nonvanishing field, the default eastward loop around the north
 * pole must give graph winding +1 (a (1,1)-curve), and the reversed loop
 * must give −1. This test pins the sign choice e₂ = e₁ × γ in frames.ts —
 * if it fails after touching frames or the embedding, the convention broke.
 */

import { describe, it, expect } from "vitest";
import { latitudeLoop, tangentGraphLoop, movingFrameAt, overPoleFamily } from "../src/math/frames.ts";
import { projectedConstantField } from "../src/math/maps/tangentFields.ts";
import { sampleGraphCurve } from "../src/math/graphCurve.ts";
import { windingNumber } from "../src/math/analysis/winding.ts";
import { vec3, dot3, length3 } from "../src/math/types.ts";

const N = 512;

describe("moving frame", () => {
    it("is orthonormal and tangent along a latitude", () => {
        const loop = latitudeLoop(0.9);
        const pos = vec3();
        const e1 = vec3();
        const e2 = vec3();
        for (const theta of [0, 1.1, 2.9, 4.4]) {
            movingFrameAt(loop, theta, pos, e1, e2);
            expect(length3(e1)).toBeCloseTo(1, 6);
            expect(length3(e2)).toBeCloseTo(1, 6);
            expect(dot3(e1, e2)).toBeCloseTo(0, 6);
            expect(dot3(e1, pos)).toBeCloseTo(0, 6);
            expect(dot3(e2, pos)).toBeCloseTo(0, 6);
        }
    });
});

describe("Poincaré orientation convention", () => {
    // field ≈ constant x̂ near the north pole, zeros at ±x̂ on the equator
    const field = projectedConstantField(1, 0, 0);

    it("small eastward north-pole loop has winding +1", () => {
        const loop = tangentGraphLoop(field, latitudeLoop(0.1));
        const curve = sampleGraphCurve(loop, N, "vector-field");
        expect(windingNumber(curve)).toBeCloseTo(1, 4);
    });

    it("reversed loop has winding −1", () => {
        const loop = tangentGraphLoop(field, latitudeLoop(0.1, true));
        const curve = sampleGraphCurve(loop, N, "vector-field");
        expect(windingNumber(curve)).toBeCloseTo(-1, 4);
    });
});

describe("over-the-pole homotopy γ → γ̄ (paper §4)", () => {
    const alpha0 = 0.25;
    const field = projectedConstantField(1, 0, 0);
    const p = vec3();
    const q = vec3();

    it("starts at the α₀ latitude loop", () => {
        const { loop } = overPoleFamily(0, alpha0);
        const lat = latitudeLoop(alpha0);
        for (const theta of [0, 1.3, 2.7, 5.1]) {
            loop.evalLoop(theta, p);
            lat.evalLoop(theta, q);
            expect(p.x).toBeCloseTo(q.x, 8);
            expect(p.y).toBeCloseTo(q.y, 8);
            expect(p.z).toBeCloseTo(q.z, 8);
        }
    });

    it("ends at the SAME circle traversed backwards: γ₁(θ) = γ₀(π − θ)", () => {
        const { loop } = overPoleFamily(1, alpha0);
        const lat = latitudeLoop(alpha0);
        for (const theta of [0, 0.8, 2.2, 4.6]) {
            loop.evalLoop(theta, p);
            lat.evalLoop(Math.PI - theta, q);
            expect(p.x).toBeCloseTo(q.x, 8);
            expect(p.y).toBeCloseTo(q.y, 8);
            expect(p.z).toBeCloseTo(q.z, 8);
        }
    });

    it("is continuous where the legs meet (s = ½)", () => {
        const a = overPoleFamily(0.5 - 1e-9, alpha0).loop;
        const b = overPoleFamily(0.5 + 1e-9, alpha0).loop;
        for (const theta of [0, 1.9, 3.8]) {
            a.evalLoop(theta, p);
            b.evalLoop(theta, q);
            expect(p.x).toBeCloseTo(q.x, 6);
            expect(p.y).toBeCloseTo(q.y, 6);
            expect(p.z).toBeCloseTo(q.z, 6);
        }
    });

    it("carries the graph from winding +1 to winding −1", () => {
        const start = sampleGraphCurve(
            tangentGraphLoop(field, overPoleFamily(0, alpha0).loop),
            N,
            "vector-field",
        );
        const end = sampleGraphCurve(
            tangentGraphLoop(field, overPoleFamily(1, alpha0).loop),
            N,
            "vector-field",
        );
        expect(windingNumber(start)).toBeCloseTo(1, 4);
        expect(windingNumber(end)).toBeCloseTo(-1, 4);
    });
});
