import { describe, it, expect } from "vitest";
import {
    createDiskGrid,
    pushforwardInto,
    orientationCounts,
    signedArea,
    plDiskMap,
    buildSpringEdges,
    relaxSprings,
    buildNeighborhoods,
    smoothDisplacements,
} from "../src/math/diskGrid.ts";
import {
    identityMap,
    radialContraction,
    swirlMap,
    creaseFold,
    composeDiskMaps,
    handleWarp,
    strokeWarp,
    foldTaking,
    similarityMap,
} from "../src/math/maps/diskMaps.ts";
import { vec2, length2 } from "../src/math/types.ts";
import { set2 } from "../src/math/types.ts";
import type { Vec2 } from "../src/math/types.ts";

describe("createDiskGrid", () => {
    const grid = createDiskGrid(10, 24);

    it("has the advertised counts and valid indices", () => {
        expect(grid.V).toBe(1 + 10 * 24);
        expect(grid.T).toBe(24 + 2 * 24 * 9);
        for (const i of grid.indices) expect(i).toBeLessThan(grid.V);
    });

    it("outermost ring lies on ∂D², everything inside", () => {
        let boundary = 0;
        for (let i = 0; i < grid.V; i++) {
            const r = Math.hypot(grid.domain[2 * i]!, grid.domain[2 * i + 1]!);
            expect(r).toBeLessThanOrEqual(1 + 1e-6);
            if (Math.abs(r - 1) < 1e-6) boundary++;
        }
        expect(boundary).toBe(24);
    });

    it("every domain triangle is positively oriented (CCW)", () => {
        for (let t = 0; t < grid.T; t++) {
            const [a, b, c] = [
                grid.indices[3 * t]!,
                grid.indices[3 * t + 1]!,
                grid.indices[3 * t + 2]!,
            ];
            const area = signedArea(
                grid.domain[2 * a]!, grid.domain[2 * a + 1]!,
                grid.domain[2 * b]!, grid.domain[2 * b + 1]!,
                grid.domain[2 * c]!, grid.domain[2 * c + 1]!,
            );
            expect(area).toBeGreaterThan(0);
        }
    });
});

describe("plDiskMap", () => {
    it("is the exact identity at rest, everywhere in the disk", () => {
        const sheet = plDiskMap(createDiskGrid(16, 32));
        const out = vec2();
        for (const [x, y] of [[0, 0], [0.03, -0.02], [0.5, 0.3], [-0.71, 0.4], [0.99, 0], [0, -1]]) {
            sheet.evalDisk(vec2(x!, y!), 0, out);
            expect(out.x).toBeCloseTo(x!, 6);
            expect(out.y).toBeCloseTo(y!, 6);
        }
    });

    it("interpolates edited vertex positions barycentrically", () => {
        const grid = createDiskGrid(16, 32);
        const sheet = plDiskMap(grid);
        // move vertex 1 (first vertex of ring 1, at angle 0) by (0.1, 0.2)
        const vx = grid.domain[2]!;
        const vy = grid.domain[3]!;
        sheet.positions[2] = vx + 0.1;
        sheet.positions[3] = vy + 0.2;
        const out = vec2();
        sheet.evalDisk(vec2(vx, vy), 0, out); // at the vertex: full displacement
        expect(out.x).toBeCloseTo(vx + 0.1, 5);
        expect(out.y).toBeCloseTo(vy + 0.2, 5);
        sheet.evalDisk(vec2(vx / 2, vy / 2), 0, out); // toward center: half
        expect(out.x).toBeCloseTo(vx / 2 + 0.05, 5);
        expect(out.y).toBeCloseTo(vy / 2 + 0.1, 5);
        sheet.restore(sheet.snapshot()); // snapshot/restore round-trips
        sheet.resetToIdentity();
        sheet.evalDisk(vec2(vx, vy), 0, out);
        expect(out.x).toBeCloseTo(vx, 6);
    });
});

describe("springs", () => {
    it("relaxation reduces stretch and leaves the identity alone", () => {
        const grid = createDiskGrid(12, 24);
        const springs = buildSpringEdges(grid);
        const sheet = plDiskMap(grid);

        const stretch = () => {
            let total = 0;
            for (let e = 0; e < springs.rest.length; e++) {
                const a = springs.pairs[2 * e]!;
                const b = springs.pairs[2 * e + 1]!;
                const len = Math.hypot(
                    sheet.positions[2 * a]! - sheet.positions[2 * b]!,
                    sheet.positions[2 * a + 1]! - sheet.positions[2 * b + 1]!,
                );
                total += (len - springs.rest[e]!) ** 2;
            }
            return total;
        };

        // identity is an equilibrium
        relaxSprings(grid, springs, sheet.positions, { iterations: 5 });
        expect(stretch()).toBeLessThan(1e-12);

        // squash half the disk, then relax: stretch energy drops
        for (let i = 0; i < grid.V; i++) {
            if (sheet.positions[2 * i]! > 0) sheet.positions[2 * i] = sheet.positions[2 * i]! * 0.4;
        }
        const before = stretch();
        relaxSprings(grid, springs, sheet.positions, { iterations: 80, stiffness: 0.3 });
        expect(stretch()).toBeLessThan(before * 0.5);
        // and everything stays inside the disk
        for (let i = 0; i < grid.V; i++) {
            expect(Math.hypot(sheet.positions[2 * i]!, sheet.positions[2 * i + 1]!)).toBeLessThanOrEqual(1 + 1e-6);
        }
    });
});

describe("compress-only springs (unscrunch)", () => {
    it("re-inflates a scrunched sheet but leaves a stretched one alone", () => {
        const grid = createDiskGrid(12, 24);
        const springs = buildSpringEdges(grid);
        const sheet = plDiskMap(grid);

        // scrunched: uniform shrink to 40% → compressed edges push back out.
        // Expansion propagates inward from the free rim (diffusion-like),
        // so give it plenty of iterations on this 12-ring grid.
        for (let i = 0; i < 2 * grid.V; i++) sheet.positions[i] = 0.4 * grid.domain[i]!;
        relaxSprings(grid, springs, sheet.positions, {
            iterations: 400,
            stiffness: 0.5,
            mode: "compress-only",
        });
        const rimVertex = 1 + (grid.rings - 1) * grid.sectors;
        const rimRadius = Math.hypot(
            sheet.positions[2 * rimVertex]!,
            sheet.positions[2 * rimVertex + 1]!,
        );
        expect(rimRadius).toBeGreaterThan(0.6); // grew back substantially

        // one-sidedness, mirror case: on the fully compressed configuration
        // (uniform shrink), stretch-only mode has NOTHING to act on — any
        // in-disk deformation mixes stretch and compression somewhere, so
        // this is the clean fixture for the mode check
        for (let i = 0; i < 2 * grid.V; i++) sheet.positions[i] = 0.4 * grid.domain[i]!;
        const before = sheet.snapshot();
        relaxSprings(grid, springs, sheet.positions, {
            iterations: 30,
            stiffness: 0.5,
            mode: "stretch-only",
        });
        let maxChange = 0;
        for (let i = 0; i < 2 * grid.V; i++) {
            maxChange = Math.max(maxChange, Math.abs(sheet.positions[i]! - before[i]!));
        }
        expect(maxChange).toBe(0);
    });
});

describe("smoothDisplacements (wrinkle iron)", () => {
    const grid = createDiskGrid(12, 24);
    const hood = buildNeighborhoods(grid);
    const scratch = new Float32Array(2 * grid.V);

    it("fixes the identity exactly and lets stretch pass nearly untouched", () => {
        const sheet = plDiskMap(grid);
        smoothDisplacements(grid, hood, sheet.positions, scratch, { iterations: 5, lambda: 0.5 });
        for (let i = 0; i < 2 * grid.V; i++) {
            expect(sheet.positions[i]).toBeCloseTo(grid.domain[i]!, 10);
        }
        // a uniform shrink (affine displacement) barely changes: stretch is
        // (nearly) free — linear fields are preserved only up to the grid's
        // discretization, and this test grid is deliberately coarse (12×24)
        for (let i = 0; i < 2 * grid.V; i++) sheet.positions[i] = 0.6 * grid.domain[i]!;
        smoothDisplacements(grid, hood, sheet.positions, scratch, { iterations: 10, lambda: 0.5 });
        let maxDrift = 0;
        for (let i = 0; i < 2 * grid.V; i++) {
            maxDrift = Math.max(maxDrift, Math.abs(sheet.positions[i]! - 0.6 * grid.domain[i]!));
        }
        expect(maxDrift).toBeLessThan(0.1); // contrast: springs would undo the shrink entirely
    });

    it("decays high-frequency noise fast", () => {
        const sheet = plDiskMap(grid);
        // deterministic wiggle on top of the identity
        for (let i = 0; i < grid.V; i++) {
            sheet.positions[2 * i] = sheet.positions[2 * i]! + 0.03 * Math.sin(37 * i);
            sheet.positions[2 * i + 1] = sheet.positions[2 * i + 1]! + 0.03 * Math.cos(53 * i);
        }
        const noise = () => {
            let total = 0;
            for (let i = 0; i < 2 * grid.V; i++) {
                total += (sheet.positions[i]! - grid.domain[i]!) ** 2;
            }
            return total;
        };
        const before = noise();
        smoothDisplacements(grid, hood, sheet.positions, scratch, { iterations: 8, lambda: 0.5 });
        expect(noise()).toBeLessThan(before * 0.25);
    });
});

describe("pushforward + orientation census", () => {
    const grid = createDiskGrid(16, 32);
    const positions = new Float32Array(2 * grid.V);

    it("identity pushforward reproduces the domain, all preserving", () => {
        pushforwardInto(grid, identityMap(), 0, positions);
        for (let i = 0; i < 2 * grid.V; i++) {
            expect(positions[i]).toBeCloseTo(grid.domain[i]!, 6);
        }
        const counts = orientationCounts(grid, positions);
        expect(counts.reversing).toBe(0);
        expect(counts.degenerate).toBe(0);
        expect(counts.foldFraction).toBe(0);
    });

    it("contractions and mild swirls are fold-free", () => {
        for (const f of [radialContraction(0.5), swirlMap(0.75, 2.5, 0.25, 0)]) {
            pushforwardInto(grid, f, 0, positions);
            expect(orientationCounts(grid, positions).reversing).toBe(0);
        }
    });

    it("creaseFold stays exactly disk-valued and creates folds", () => {
        // folding across a chord maps D² into itself with NO clamp:
        // boundary points land at norm² = 1 + 4t(t − v) < 1
        const fold = creaseFold(0.3, 0.7);
        const out = vec2();
        for (let i = 0; i < 100; i++) {
            const theta = (2 * Math.PI * i) / 100;
            fold.evalDisk(vec2(Math.cos(theta), Math.sin(theta)), 0, out);
            expect(length2(out)).toBeLessThanOrEqual(1 + 1e-12);
        }
        pushforwardInto(grid, fold, 0, positions);
        expect(orientationCounts(grid, positions).reversing).toBeGreaterThan(0);
    });

    it("composite params expose both factors' live values (cache keys work)", () => {
        const swirl = swirlMap(0.75, 2.5, 0.25, 0);
        const fold = creaseFold(0.5, 1.0);
        const f = composeDiskMaps(fold, swirl);
        const before = JSON.stringify(f.params);
        swirl.params.tau = 3.0;
        expect(JSON.stringify(f.params)).not.toBe(before);
        const mid = JSON.stringify(f.params);
        fold.params.t = 0.2;
        expect(JSON.stringify(f.params)).not.toBe(mid);
    });

    it("handleWarp at rest is the exact identity; displaced it stays disk-valued", () => {
        const warp = handleWarp([vec2(0, 0), vec2(0.6, 0)], 0.4);
        const out = vec2();
        // at rest: exact identity (hard projection is the identity inside D²)
        for (const [x, y] of [[0.3, -0.4], [0, 0], [0.99, 0]]) {
            warp.evalDisk(vec2(x!, y!), 0, out);
            expect(out.x).toBeCloseTo(x!, 12);
            expect(out.y).toBeCloseTo(y!, 12);
        }
        // a violent drag stays inside the disk and shows up in params
        const before = JSON.stringify(warp.params);
        warp.setDisplacement(1, -1.5, 0.8);
        expect(JSON.stringify(warp.params)).not.toBe(before);
        for (let i = 0; i < 60; i++) {
            const theta = (2 * Math.PI * i) / 60;
            warp.evalDisk(vec2(Math.cos(theta), Math.sin(theta)), 0, out);
            expect(length2(out)).toBeLessThanOrEqual(1 + 1e-12);
        }
        warp.reset();
        warp.evalDisk(vec2(0.5, 0.2), 0, out);
        expect(out.x).toBeCloseTo(0.5, 12);
    });

    it("strokeWarp: identity at rest, cloth follows a stroke, undo restores", () => {
        const cloth = strokeWarp();
        const out = vec2();
        cloth.evalDisk(vec2(0.4, -0.3), 0, out);
        expect(out.x).toBeCloseTo(0.4, 12); // no strokes: exact identity

        const i = cloth.beginStroke(vec2(0.2, 0.1), 0.3);
        cloth.moveStroke(i, 0.3, -0.2);
        // the pinched point moves by exactly the stroke displacement
        cloth.evalDisk(vec2(0.2, 0.1), 0, out);
        expect(out.x).toBeCloseTo(0.5, 10);
        expect(out.y).toBeCloseTo(-0.1, 10);
        // far away the cloth barely moves
        cloth.evalDisk(vec2(-0.8, -0.1), 0, out);
        expect(Math.hypot(out.x + 0.8, out.y + 0.1)).toBeLessThan(0.01);

        cloth.undoStroke();
        cloth.evalDisk(vec2(0.2, 0.1), 0, out);
        expect(out.x).toBeCloseTo(0.2, 12);
    });

    it("foldTaking: the drag gesture's crease reflects from → to and fixes the near side", () => {
        const out = vec2();
        for (const [from, to] of [
            [vec2(1, 0), vec2(0.2, 0.1)],
            [vec2(Math.cos(2.3), Math.sin(2.3)), vec2(-0.1, -0.3)],
        ] as const) {
            const { t, angle } = foldTaking(from, to);
            expect(t).toBeGreaterThanOrEqual(0); // boundary → interior always folds at t ≥ 0
            const fold = creaseFold(t, angle);
            fold.evalDisk(from, 0, out);
            expect(out.x).toBeCloseTo(to.x, 10);
            expect(out.y).toBeCloseTo(to.y, 10);
            // a point already past the crease on the `to` side is untouched
            fold.evalDisk(to, 0, out);
            expect(out.x).toBeCloseTo(to.x, 10);
            expect(out.y).toBeCloseTo(to.y, 10);
        }
    });

    it("similarityMap: exact identity at rest, shrinks+moves exactly inside", () => {
        const out = vec2();
        similarityMap(1, 0, 0).evalDisk(vec2(0.7, -0.2), 0, out);
        expect(out.x).toBeCloseTo(0.7, 12);
        const g = similarityMap(0.5, 0.3, -0.1);
        g.evalDisk(vec2(0.8, 0.4), 0, out);
        expect(out.x).toBeCloseTo(0.7, 12);
        expect(out.y).toBeCloseTo(0.1, 12);
        expect(length2(out)).toBeLessThanOrEqual(1);
    });

    it("a fold map reverses (roughly) half the triangles", () => {
        // f(x, y) = (x, |y|): continuous, disk-valued, folds along y = 0
        const fold = {
            id: "fold",
            name: "fold",
            params: {},
            evalDisk: (x: Vec2, _t: number, out: Vec2) => set2(out, x.x, Math.abs(x.y)),
        };
        pushforwardInto(grid, fold, 0, positions);
        const counts = orientationCounts(grid, positions);
        expect(counts.foldFraction).toBeGreaterThan(0.4);
        expect(counts.foldFraction).toBeLessThan(0.6);
    });
});
