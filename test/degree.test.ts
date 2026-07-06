/**
 * Degree census tests: boundary windings on known index configurations,
 * the quadtree localizer (including its documented cancelling-pair
 * limitation and the minDepth knob that resolves it), the Lefschetz
 * identity for disk maps, and Poincaré–Hopf on the sphere — the xz-gradient
 * Morse field with its 6 zeros (2 max + 2 min + 2 saddles, Σ = 2) is the
 * decisive case because it exercises index −1.
 */

import { describe, it, expect } from "vitest";
import { boundaryWinding, findFieldZeros, zeroIndex } from "../src/math/analysis/degree.ts";
import type { PlaneField } from "../src/math/analysis/degree.ts";
import { findSphereFieldZeros } from "../src/math/analysis/sphereFieldZeros.ts";
import { findAllFixedPoints } from "../src/math/proofs/brouwer.ts";
import { identityMap, radialContraction, swirlMap } from "../src/math/maps/diskMaps.ts";
import { rotationalField, projectedConstantField } from "../src/math/maps/tangentFields.ts";
import type { TangentVectorField } from "../src/math/maps/tangentFields.ts";
import { set2, set3, dot3, addScaled3 } from "../src/math/types.ts";
import type { Vec2 } from "../src/math/types.ts";

const identityField: PlaneField = (x, y, out) => set2(out, x, y);
const saddleField: PlaneField = (x, y, out) => set2(out, x, -y);

describe("boundaryWinding", () => {
    it("is 1 around a source, 0 around nothing, −1 around a saddle", () => {
        expect(boundaryWinding(identityField, { x0: -1, y0: -1, x1: 1, y1: 1 }).winding).toBe(1);
        expect(boundaryWinding(identityField, { x0: 2, y0: 2, x1: 3, y1: 3 }).winding).toBe(0);
        expect(boundaryWinding(saddleField, { x0: -1, y0: -1, x1: 1, y1: 1 }).winding).toBe(-1);
    });

    it("adds indices: z² has winding 2", () => {
        const zSquared: PlaneField = (x, y, out) => set2(out, x * x - y * y, 2 * x * y);
        expect(boundaryWinding(zSquared, { x0: -1, y0: -1, x1: 1, y1: 1 }).winding).toBe(2);
    });
});

describe("zeroIndex", () => {
    it("classifies node vs saddle", () => {
        expect(zeroIndex(identityField, 0, 0)).toBe(1);
        expect(zeroIndex(saddleField, 0, 0)).toBe(-1);
    });
});

describe("findFieldZeros", () => {
    it("finds both roots of z² = c, each of index +1", () => {
        // roots of z² − c at ±√c
        const c = { x: 0.3, y: 0.4 }; // √c ≈ 0.6325·e^{i·0.4636/2}
        const F: PlaneField = (x, y, out) =>
            set2(out, x * x - y * y - c.x, 2 * x * y - c.y);
        const { zeros, indexSum } = findFieldZeros(F, { x0: -1, y0: -1, x1: 1, y1: 1 });
        expect(zeros).toHaveLength(2);
        expect(indexSum).toBe(2);
        for (const z of zeros) {
            expect(z.index).toBe(1);
            expect(z.residual).toBeLessThan(1e-10);
            // verify z² = c
            expect(z.x * z.x - z.y * z.y).toBeCloseTo(c.x, 8);
            expect(2 * z.x * z.y).toBeCloseTo(c.y, 8);
        }
    });

    it("finds an anti-holomorphic pair of saddles (Σ = −2)", () => {
        // conj(z)² = c: two zeros, each index −1
        const F: PlaneField = (x, y, out) =>
            set2(out, x * x - y * y - 0.3, -2 * x * y - 0.4);
        const { zeros, indexSum } = findFieldZeros(F, { x0: -1, y0: -1, x1: 1, y1: 1 });
        expect(zeros).toHaveLength(2);
        expect(indexSum).toBe(-2);
    });

    it("resolves a cancelling ±1 pair with sufficient minDepth (documented limitation)", () => {
        // zeros at (0.1, 0.1) and (0.2, 0.1): indices +1 and −1, so every
        // enclosing box has winding 0 — invisible to pure degree pruning
        const F: PlaneField = (x, y, out) =>
            set2(out, (x - 0.1) * (x - 0.2), y - 0.1);
        const coarse = findFieldZeros(F, { x0: -1, y0: -1, x1: 1, y1: 1 });
        expect(coarse.zeros).toHaveLength(0); // hidden below the default floor

        const fine = findFieldZeros(F, { x0: -1, y0: -1, x1: 1, y1: 1 }, { minDepth: 5 });
        expect(fine.zeros).toHaveLength(2);
        expect(fine.indexSum).toBe(0);
    });
});

describe("Lefschetz: Σ index = 1 for disk maps", () => {
    it("radial contraction: one fixed point at 0, index +1", () => {
        const { fixedPoints, indexSum } = findAllFixedPoints(radialContraction(0.5));
        expect(fixedPoints).toHaveLength(1);
        expect(fixedPoints[0]!.r).toBeLessThan(1e-9);
        expect(indexSum).toBe(1);
    });

    it("rotation by 90°: one fixed point at 0, index +1", () => {
        const rotate = {
            id: "rot",
            name: "rot",
            params: {},
            evalDisk: (x: Vec2, _t: number, out: Vec2) => set2(out, -x.y, x.x),
        };
        const { fixedPoints, indexSum } = findAllFixedPoints(rotate);
        expect(fixedPoints).toHaveLength(1);
        expect(indexSum).toBe(1);
    });

    it("handleWarp at rest (the playground's blank slate) is degenerate and instant", async () => {
        // regression: the degeneracy probe must sample INSIDE the disk —
        // square-grid corners outside D² masked this and the census ground
        // through its whole cell budget on every playground load
        const { handleWarp } = await import("../src/math/maps/diskMaps.ts");
        const { vec2: v } = await import("../src/math/types.ts");
        const warp = handleWarp([v(0, 0), v(0.5, 0), v(-0.3, 0.4)], 0.3);
        const start = performance.now();
        const census = findAllFixedPoints(warp);
        expect(census.degenerate).toBe(true);
        expect(performance.now() - start).toBeLessThan(50);
    });

    it("identity map: reported degenerate (a continuum of fixed points), not ground out", () => {
        // d ≡ 0 defeats degree pruning entirely — the census must bail
        // honestly and fast rather than subdividing everything
        const start = performance.now();
        const census = findAllFixedPoints(identityMap());
        expect(census.degenerate).toBe(true);
        expect(census.indexSum).toBeNull();
        expect(performance.now() - start).toBeLessThan(100);
    });

    it("swirl map: whatever the census finds, indices sum to 1", () => {
        const { fixedPoints, indexSum } = findAllFixedPoints(swirlMap(0.75, 2.5, 0.25, 0.0));
        expect(fixedPoints.length).toBeGreaterThanOrEqual(1);
        expect(indexSum).toBe(1);
        for (const fp of fixedPoints) expect(fp.residual).toBeLessThan(1e-9);
    });
});

describe("Poincaré–Hopf: Σ index = 2 on the sphere", () => {
    it("rotational field: two +1 zeros at the poles", () => {
        const { zeros, indexSum } = findSphereFieldZeros(rotationalField(0, 0, 1));
        expect(zeros).toHaveLength(2);
        expect(indexSum).toBe(2);
        for (const z of zeros) {
            expect(Math.abs(z.position.z)).toBeCloseTo(1, 5);
            expect(z.index).toBe(1);
        }
    });

    it("projected constant field: two +1 zeros at ±a", () => {
        const { zeros, indexSum } = findSphereFieldZeros(projectedConstantField(1, 0, 0));
        expect(zeros).toHaveLength(2);
        expect(indexSum).toBe(2);
        for (const z of zeros) expect(Math.abs(z.position.x)).toBeCloseTo(1, 5);
    });

    it("gradient of h = xz: 6 zeros (2 max + 2 min + 2 saddles), Σ = 2", () => {
        // ∇_{S²}(xz) = tangent projection of (z, 0, x); critical points:
        // ±(1,0,1)/√2 and ±(1,0,−1)/√2 (index +1), and (0,±1,0) (saddles)
        const grad: TangentVectorField = {
            id: "grad-xz",
            name: "grad xz",
            params: {},
            evalTangent: (x, _t, out) => {
                set3(out, x.z, 0, x.x);
                return addScaled3(out, out, x, -dot3(out, x));
            },
        };
        const { zeros, indexSum } = findSphereFieldZeros(grad);
        expect(zeros).toHaveLength(6);
        expect(indexSum).toBe(2);
        const saddles = zeros.filter((z) => z.index === -1);
        expect(saddles).toHaveLength(2);
        for (const s of saddles) expect(Math.abs(s.position.y)).toBeCloseTo(1, 5);
    });
});
