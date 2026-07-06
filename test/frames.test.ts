/**
 * The Poincaré orientation convention (math spec §4.2):
 * with a nonvanishing field, the default eastward loop around the north
 * pole must give graph winding +1 (a (1,1)-curve), and the reversed loop
 * must give −1. This test pins the sign choice e₂ = e₁ × γ in frames.ts —
 * if it fails after touching frames or the embedding, the convention broke.
 */

import { describe, it, expect } from "vitest";
import { latitudeLoop, tangentGraphLoop, movingFrameAt } from "../src/math/frames.ts";
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
