import { describe, expect, it } from "vitest";

import {
    createSphereGrid,
    plSphereMap,
    plTangentField,
    pushforwardSphereInto,
    smoothTangentVectors,
} from "../src/math/sphereGrid.ts";
import { buildAdjacency } from "../src/math/diskGrid.ts";
import { equatorialProjection, offsetProjection, spherePoint } from "../src/math/maps/sphereMaps.ts";
import { projectedConstantField } from "../src/math/maps/tangentFields.ts";
import { findSphereFieldZeros } from "../src/math/analysis/sphereFieldZeros.ts";
import { vec2, vec3, dot3, length3 } from "../src/math/types.ts";

describe("createSphereGrid", () => {
    const grid = createSphereGrid(12, 24);

    it("has the documented vertex and triangle counts", () => {
        expect(grid.V).toBe(2 + (12 - 1) * 24);
        expect(grid.T).toBe(2 * 24 * (12 - 1));
        for (const i of grid.indices) expect(i).toBeLessThan(grid.V);
    });

    it("is a closed surface: E = 3T/2 and Euler characteristic 2", () => {
        const seen = new Set<number>();
        for (let t = 0; t < grid.T; t++) {
            for (let e = 0; e < 3; e++) {
                const a = grid.indices[3 * t + e]!;
                const b = grid.indices[3 * t + ((e + 1) % 3)]!;
                seen.add(Math.min(a, b) * grid.V + Math.max(a, b));
            }
        }
        expect(seen.size).toBe((3 * grid.T) / 2);
        expect(grid.V - seen.size + grid.T).toBe(2);
    });

    it("places every vertex on the unit sphere at its lat-long slot", () => {
        const p = vec3();
        for (let i = 0; i < grid.V; i++) {
            const r = Math.hypot(grid.domain[3 * i]!, grid.domain[3 * i + 1]!, grid.domain[3 * i + 2]!);
            expect(r).toBeCloseTo(1, 6);
        }
        for (let k = 1; k < grid.bands; k++) {
            for (let j = 0; j < grid.sectors; j++) {
                const i = 1 + (k - 1) * grid.sectors + j;
                spherePoint((Math.PI * k) / grid.bands, (2 * Math.PI * j) / grid.sectors, p);
                expect(grid.domain[3 * i]).toBeCloseTo(p.x, 6);
                expect(grid.domain[3 * i + 1]).toBeCloseTo(p.y, 6);
                expect(grid.domain[3 * i + 2]).toBeCloseTo(p.z, 6);
            }
        }
    });

    it("orients every triangle CCW seen from outside", () => {
        for (let t = 0; t < grid.T; t++) {
            const a = grid.indices[3 * t]!;
            const b = grid.indices[3 * t + 1]!;
            const c = grid.indices[3 * t + 2]!;
            const ax = grid.domain[3 * a]!;
            const ay = grid.domain[3 * a + 1]!;
            const az = grid.domain[3 * a + 2]!;
            const ux = grid.domain[3 * b]! - ax;
            const uy = grid.domain[3 * b + 1]! - ay;
            const uz = grid.domain[3 * b + 2]! - az;
            const wx = grid.domain[3 * c]! - ax;
            const wy = grid.domain[3 * c + 1]! - ay;
            const wz = grid.domain[3 * c + 2]! - az;
            // cross(b−a, c−a) · (a+b+c) > 0 ⟺ outward-facing
            const nx = uy * wz - uz * wy;
            const ny = uz * wx - ux * wz;
            const nz = ux * wy - uy * wx;
            const outward =
                nx * (3 * ax + ux + wx) + ny * (3 * ay + uy + wy) + nz * (3 * az + uz + wz);
            expect(outward).toBeGreaterThan(0);
        }
    });

    it("buildAdjacency is symmetric and gives the poles `sectors` neighbors", () => {
        const hood = buildAdjacency(grid);
        const neighbors = (i: number): number[] =>
            Array.from(hood.list.slice(hood.start[i]!, hood.start[i + 1]!));
        expect(neighbors(0).length).toBe(grid.sectors);
        expect(neighbors(grid.V - 1).length).toBe(grid.sectors);
        for (let i = 0; i < grid.V; i++) {
            for (const n of neighbors(i)) expect(neighbors(n)).toContain(i);
        }
    });
});

describe("plSphereMap", () => {
    const grid = createSphereGrid(48, 96);

    it("reproduces its preset exactly at every vertex", () => {
        const preset = offsetProjection(0.35, 0.1, 0.15);
        const f = plSphereMap(grid, preset);
        const x = vec3();
        const got = vec2();
        const want = vec2();
        for (let i = 0; i < grid.V; i += 17) {
            x.x = grid.domain[3 * i]!;
            x.y = grid.domain[3 * i + 1]!;
            x.z = grid.domain[3 * i + 2]!;
            f.evalSphere(x, 0, got);
            preset.evalSphere(x, 0, want);
            expect(got.x).toBeCloseTo(want.x, 5);
            expect(got.y).toBeCloseTo(want.y, 5);
        }
    });

    it("reproduces a linear map at random points to O(h²)", () => {
        const f = plSphereMap(grid, equatorialProjection());
        const x = vec3();
        const got = vec2();
        let rng = 1234;
        const next = (): number => {
            rng = (rng * 48271) % 2147483647;
            return rng / 2147483647;
        };
        for (let trial = 0; trial < 500; trial++) {
            const phi = Math.acos(2 * next() - 1);
            const theta = 2 * Math.PI * next();
            spherePoint(phi, theta, x);
            f.evalSphere(x, 0, got);
            // equatorial projection is linear, so PL error is pure chord sag
            expect(Math.hypot(got.x - x.x, got.y - x.y)).toBeLessThan(3e-3);
        }
    });

    it("is continuous across band, sector, seam, and pole-fan boundaries", () => {
        const f = plSphereMap(grid, offsetProjection(0.35, 0.1, 0.15));
        const a = vec3();
        const b = vec3();
        const fa = vec2();
        const fb = vec2();
        const pairs: [number, number, number, number][] = [
            // [phiA, thetaA, phiB, thetaB] straddling a boundary
            [Math.PI / 48 - 1e-4, 0.3, Math.PI / 48 + 1e-4, 0.3], // band edge (pole fan)
            [1.1, (2 * Math.PI) / 96 - 1e-4, 1.1, (2 * Math.PI) / 96 + 1e-4], // sector edge
            [1.3, 1e-4, 1.3, 2 * Math.PI - 1e-4], // θ = 0 seam
            [Math.PI - Math.PI / 48 - 1e-4, 2.0, Math.PI - Math.PI / 48 + 1e-4, 2.0], // south fan
        ];
        for (const [phiA, thetaA, phiB, thetaB] of pairs) {
            spherePoint(phiA, thetaA, a);
            spherePoint(phiB, thetaB, b);
            f.evalSphere(a, 0, fa);
            f.evalSphere(b, 0, fb);
            expect(Math.hypot(fa.x - fb.x, fa.y - fb.y)).toBeLessThan(1e-3);
        }
    });

    it("snapshot/restore/resetToPreset round-trip", () => {
        const f = plSphereMap(grid, equatorialProjection());
        const before = f.snapshot();
        f.positions[10] = 0.42;
        f.positions[11] = -0.13;
        expect(f.snapshot()[10]).toBeCloseTo(0.42, 6);
        f.restore(before);
        expect(Array.from(f.positions)).toEqual(Array.from(before));
        f.positions.fill(0);
        f.resetToPreset(equatorialProjection());
        const rebaked = new Float32Array(2 * grid.V);
        pushforwardSphereInto(grid, equatorialProjection(), 0, rebaked);
        expect(Array.from(f.positions)).toEqual(Array.from(rebaked));
    });
});

describe("plTangentField", () => {
    const grid = createSphereGrid(48, 96);

    it("stays tangent and length-clamped at random query points", () => {
        const v = plTangentField(grid, projectedConstantField(1, 0, 0));
        const x = vec3();
        const out = vec3();
        let rng = 999;
        const next = (): number => {
            rng = (rng * 48271) % 2147483647;
            return rng / 2147483647;
        };
        for (let trial = 0; trial < 300; trial++) {
            spherePoint(Math.acos(2 * next() - 1), 2 * Math.PI * next(), x);
            v.evalTangent(x, 0, out);
            expect(Math.abs(dot3(out, x))).toBeLessThan(1e-6);
            expect(length3(out)).toBeLessThan(1 + 1e-6);
        }
    });

    it("reproduces its preset at random points to O(h²)", () => {
        const preset = projectedConstantField(1, 0, 0);
        const v = plTangentField(grid, preset);
        const x = vec3();
        const got = vec3();
        const want = vec3();
        let rng = 7;
        const next = (): number => {
            rng = (rng * 48271) % 2147483647;
            return rng / 2147483647;
        };
        for (let trial = 0; trial < 300; trial++) {
            spherePoint(Math.acos(2 * next() - 1), 2 * Math.PI * next(), x);
            v.evalTangent(x, 0, got);
            preset.evalTangent(x, 0, want);
            expect(Math.hypot(got.x - want.x, got.y - want.y, got.z - want.z)).toBeLessThan(5e-3);
        }
    });

    it("keeps Σ index = 2 for the PL field, before and after a comb edit", () => {
        const v = plTangentField(grid, projectedConstantField(1, 0, 0));

        const before = findSphereFieldZeros(v);
        expect(before.indexSum).toBe(2);
        expect(before.zeros.length).toBe(2);
        // the preset's zeros are at ±x̂
        const sorted = [...before.zeros].sort((p, q) => q.position.x - p.position.x);
        expect(sorted[0]!.position.x).toBeCloseTo(1, 2);
        expect(sorted[1]!.position.x).toBeCloseTo(-1, 2);

        // synthetic comb stroke near the north pole: Gaussian nudge toward ŷ
        // (replicates the brush math), then the settle smoothing
        const x = vec3();
        const nudge = vec3(0, 0.5, 0);
        for (let i = 0; i < grid.V; i++) {
            x.x = grid.domain[3 * i]!;
            x.y = grid.domain[3 * i + 1]!;
            x.z = grid.domain[3 * i + 2]!;
            const d2 = x.x * x.x + x.y * x.y + (x.z - 1) * (x.z - 1);
            const w = Math.exp(-d2 / (2 * 0.35 * 0.35));
            if (w < 1e-3) continue;
            // tangent-projected nudge, like the brush applies
            const dot = nudge.x * x.x + nudge.y * x.y + nudge.z * x.z;
            v.vectors[3 * i] = v.vectors[3 * i]! + w * (nudge.x - dot * x.x);
            v.vectors[3 * i + 1] = v.vectors[3 * i + 1]! + w * (nudge.y - dot * x.y);
            v.vectors[3 * i + 2] = v.vectors[3 * i + 2]! + w * (nudge.z - dot * x.z);
        }
        const hood = buildAdjacency(grid);
        const scratch = new Float32Array(3 * grid.V);
        smoothTangentVectors(grid, hood, v.vectors, scratch, { iterations: 4, lambda: 0.2 });

        const after = findSphereFieldZeros(v);
        expect(after.indexSum).toBe(2);
    });

    it("snapshot/restore round-trips", () => {
        const v = plTangentField(grid);
        const before = v.snapshot();
        v.vectors[33] = 0.7;
        v.restore(before);
        expect(Array.from(v.vectors)).toEqual(Array.from(before));
    });
});

describe("findAntipodalPair on PL sphere maps", () => {
    it("finds the pair of a PL offset projection, close to the analytic one", async () => {
        const { findAntipodalPair } = await import("../src/math/proofs/borsukUlam.ts");
        const grid = createSphereGrid(48, 96);
        const preset = offsetProjection(0.35, 0.1, 0.15);
        const f = plSphereMap(grid, preset);

        const analytic = findAntipodalPair(preset);
        const pl = findAntipodalPair(f, { residualTol: 1e-5 });
        expect(pl.found).toBe(true);
        expect(pl.phi).toBeCloseTo(analytic.phi, 1);
        // same pair up to the PL discretization
        const dTheta = Math.abs(
            (((pl.theta - analytic.theta) % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI,
        );
        expect(dTheta).toBeLessThan(0.1);
    });

    it("still finds a pair after a crease is baked into the positions", async () => {
        const { findAntipodalPair } = await import("../src/math/proofs/borsukUlam.ts");
        const grid = createSphereGrid(48, 96);
        const f = plSphereMap(grid, offsetProjection(0.35, 0.1, 0.15));

        // fold the image across the vertical line x = 0.25 (brouwer-style
        // crease): a genuinely non-smooth PL map
        for (let i = 0; i < grid.V; i++) {
            const x = f.positions[2 * i]!;
            if (x > 0.25) f.positions[2 * i] = 0.5 - x;
        }

        const pair = findAntipodalPair(f, { residualTol: 1e-5 });
        expect(pair.found).toBe(true);

        // verify by direct evaluation: f(x) really equals f(−x)
        const p = vec3(pair.x.x, pair.x.y, pair.x.z);
        const q = vec3(-p.x, -p.y, -p.z);
        const fp = vec2();
        const fq = vec2();
        f.evalSphere(p, 0, fp);
        f.evalSphere(q, 0, fq);
        expect(Math.hypot(fp.x - fq.x, fp.y - fq.y)).toBeLessThan(1e-5);
    });
});
