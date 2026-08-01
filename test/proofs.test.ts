import { describe, it, expect } from "vitest";
import { vec2, vec3, length2 } from "../src/math/types.ts";
import { softClampToDisk, tangentProject } from "../src/math/maps/project.ts";
import { identityMap, radialContraction, displacedContraction, swirlMap } from "../src/math/maps/diskMaps.ts";
import {
    equatorialProjection,
    distortedProjection,
    offsetProjection,
    spherePoint,
} from "../src/math/maps/sphereMaps.ts";
import {
    latitudeGraphLoop,
    antipodalGraphLoop,
    findAntipodalPair,
} from "../src/math/proofs/borsukUlam.ts";
import { projectedConstantField, rotationalField } from "../src/math/maps/tangentFields.ts";
import { identityLoop, mapLoop, findAllFixedPoints } from "../src/math/proofs/brouwer.ts";
import { latitudeLoop, tangentGraphLoop } from "../src/math/frames.ts";
import { graphDistanceAtIndex, coreDistanceAtIndex } from "../src/math/analysis/collisions.ts";
import { linkingNumber } from "../src/math/analysis/linking.ts";
import { relativeWinding, windingNumber } from "../src/math/analysis/winding.ts";
import { sampleGraphCurve } from "../src/math/graphCurve.ts";
import type { GraphCurve } from "../src/math/types.ts";
import type { DiskLoop } from "../src/math/types.ts";
import { SolidTorus } from "../src/math/torus.ts";
import { dot3 } from "../src/math/types.ts";

const N = 512;

const sample = (loop: DiskLoop): GraphCurve => sampleGraphCurve(loop, N, "map");

function minGraphDist(ga: GraphCurve, gb: GraphCurve): number {
    let m = Infinity;
    for (let i = 0; i < Math.min(ga.N, gb.N); i++) m = Math.min(m, graphDistanceAtIndex(ga, gb, i));
    return m;
}

function minCoreDist(g: GraphCurve): number {
    let m = Infinity;
    for (let i = 0; i < g.N; i++) m = Math.min(m, coreDistanceAtIndex(g, i));
    return m;
}

describe("projections", () => {
    it("soft clamp keeps every value inside the disk", () => {
        const out = vec2();
        for (const [x, y] of [[0, 0], [0.5, 0.5], [3, -4], [100, 0]]) {
            softClampToDisk(out, vec2(x!, y!));
            // → 1 only asymptotically; equality at float precision is fine
            expect(length2(out)).toBeLessThanOrEqual(1);
        }
    });

    it("disk maps stay disk-valued", () => {
        const out = vec2();
        for (const f of [identityMap(), radialContraction(0.7), displacedContraction(), swirlMap()]) {
            for (let i = 0; i < 50; i++) {
                const theta = (2 * Math.PI * i) / 50;
                f.evalDisk(vec2(Math.cos(theta), Math.sin(theta)), 0, out);
                expect(length2(out)).toBeLessThanOrEqual(1 + 1e-9);
            }
        }
    });

    it("tangent projection is tangent", () => {
        const x = vec3();
        const out = vec3();
        spherePoint(1.1, 2.3, x);
        tangentProject(out, x, vec3(1, 2, 3));
        expect(dot3(out, x)).toBeCloseTo(0, 10);
    });
});

describe("Brouwer maps", () => {
    it("identity map collides everywhere (every point is fixed)", () => {
        const gi = sample(identityLoop(0.5).loop);
        const gf = sample(mapLoop(identityMap(), 0.5).loop);
        expect(minGraphDist(gi, gf)).toBeCloseTo(0, 10);
    });

    it("radial contraction has no fixed point on any circle r > 0", () => {
        const f = radialContraction(0.5);
        for (const r of [0.1, 0.5, 1]) {
            // |f_r − i_r| = (1 − a)·r uniformly
            expect(minGraphDist(sample(identityLoop(r).loop), sample(mapLoop(f, r).loop))).toBeCloseTo(
                0.5 * r,
                5,
            );
        }
        // the only fixed point is the center
        const census = findAllFixedPoints(f);
        expect(census.indexSum).toBe(1);
        const nearest = Math.min(...census.fixedPoints.map((p) => Math.hypot(p.x.x, p.x.y)));
        expect(nearest).toBeLessThan(0.05);
    });

    it("finds the fixed point of a displaced contraction", () => {
        // f(x) = a·x + c has fixed point x* = c/(1 − a) = (0.5, 0) here
        const census = findAllFixedPoints(displacedContraction(0.4, 0.3, 0));
        expect(census.fixedPoints.length).toBeGreaterThan(0);
        expect(census.indexSum).toBe(1);
        const fp = census.fixedPoints[0]!;
        expect(fp.x.x).toBeCloseTo(0.5, 1);
        expect(fp.x.y).toBeCloseTo(0, 1);
    });
});

describe("Borsuk–Ulam maps", () => {
    it("equator twist is odd for the projection map", () => {
        const f = equatorialProjection();
        const gf = sample(latitudeGraphLoop(f, Math.PI / 2).loop);
        const gfbar = sample(antipodalGraphLoop(f, Math.PI / 2).loop);
        expect(Math.abs(relativeWinding(gf, gfbar) % 2)).toBeCloseTo(1, 4);
    });

    it("near the pole the symmetric map forces a collision", () => {
        // both curves collapse toward f(N) = f(S) = 0 as φ → 0
        const f = equatorialProjection();
        const gf = sample(latitudeGraphLoop(f, 0.02).loop);
        const gfbar = sample(antipodalGraphLoop(f, 0.02).loop);
        expect(minGraphDist(gf, gfbar)).toBeLessThan(0.05);
    });

    it("offset projection is NON-degenerate: unlinked near the pole, odd twist at the equator", () => {
        const f = offsetProjection();
        const gfPole = sample(latitudeGraphLoop(f, 0.05).loop);
        const gfbarPole = sample(antipodalGraphLoop(f, 0.05).loop);
        expect(linkingNumber(gfPole, gfbarPole).lk).toBeCloseTo(0, 10);
        expect(relativeWinding(gfPole, gfbarPole)).toBeCloseTo(0, 4);

        const gfEq = sample(latitudeGraphLoop(f, Math.PI / 2).loop);
        const gfbarEq = sample(antipodalGraphLoop(f, Math.PI / 2).loop);
        expect(Math.abs(relativeWinding(gfEq, gfbarEq) % 2)).toBeCloseTo(1, 4);
        expect(linkingNumber(gfEq, gfbarEq).lk).not.toBe(0);
    });

    it("findAntipodalPair recovers f(x) = f(−x) to machine precision", () => {
        const f = offsetProjection(0.35, 0.1, 0.15);
        const pair = findAntipodalPair(f);
        expect(pair.found).toBe(true);
        expect(pair.transition).not.toBeNull(); // localized by a genuine twist jump

        // verify independently of the finder's own residual
        const x = vec3();
        const fx = vec2();
        const fxbar = vec2();
        spherePoint(pair.phi, pair.theta, x);
        f.evalSphere(x, 0, fx);
        f.evalSphere(vec3(-x.x, -x.y, -x.z), 0, fxbar);
        expect(Math.hypot(fx.x - fxbar.x, fx.y - fxbar.y)).toBeLessThan(1e-8);
        // the even offset (bx, by) moves the shared value off the disk center
        expect(Math.hypot(pair.value.x, pair.value.y)).toBeGreaterThan(0.05);
    });

    it("distorted projection keeps values in the disk", () => {
        const f = distortedProjection(0.8);
        const out = vec2();
        const x = vec3();
        for (let i = 0; i < 100; i++) {
            spherePoint(Math.PI * (i / 100), 2.399 * i, x);
            f.evalSphere(x, 0, out);
            expect(length2(out)).toBeLessThanOrEqual(1);
        }
    });
});

describe("Poincaré fields", () => {
    it("rotational field graph hugs the core near the pole (min |v| → 0)", () => {
        const g = sample(tangentGraphLoop(rotationalField(0, 0, 1), latitudeLoop(0.06)));
        expect(minCoreDist(g)).toBeLessThan(0.1);
    });

    it("projected-constant field crosses the core when the latitude passes a zero", () => {
        // zeros at ±x̂ lie on the equator: the φ = π/2 latitude passes through them
        const g = sample(tangentGraphLoop(projectedConstantField(1, 0, 0), latitudeLoop(Math.PI / 2)));
        expect(minCoreDist(g)).toBeLessThan(0.05);
    });

    it("winding flips sign from north-pole loop to south-pole loop", () => {
        const v = projectedConstantField(1, 0, 0);
        const north = sample(tangentGraphLoop(v, latitudeLoop(0.1)));
        const south = sample(tangentGraphLoop(v, latitudeLoop(Math.PI - 0.1)));
        expect(windingNumber(north)).toBeCloseTo(1, 3);
        expect(windingNumber(south)).toBeCloseTo(-1, 3);
    });
});

describe("SolidTorus embedding", () => {
    it("places landmarks correctly (y-up mapping)", () => {
        const t = new SolidTorus({ R: 2, a: 0.5 });
        const out = vec3();
        t.embed(0, 1, 0, out); // outer equator point at θ = 0
        expect([out.x, out.y, out.z]).toEqual([2.5, 0, -0]);
        t.embed(0, 0, 1, out); // top of the tube at θ = 0
        expect(out.x).toBeCloseTo(2);
        expect(out.y).toBeCloseTo(0.5);
        t.embed(Math.PI / 2, 0, 0, out); // core quarter-turn
        expect(out.x).toBeCloseTo(0);
        expect(out.z).toBeCloseTo(-2);
    });

    it("core tangent is unit and perpendicular to the disk frame", () => {
        const t = new SolidTorus();
        const tan = vec3();
        const eu = vec3();
        const ev = vec3();
        for (const theta of [0, 0.7, 2.1, 5.5]) {
            t.coreTangentAt(theta, tan);
            t.frameAt(theta, eu, ev);
            expect(Math.hypot(tan.x, tan.y, tan.z)).toBeCloseTo(1, 10);
            expect(dot3(tan, eu)).toBeCloseTo(0, 10);
            expect(dot3(tan, ev)).toBeCloseTo(0, 10);
        }
    });
});

describe("Params", () => {
    it("cascades rebuilds in topological order through a diamond", async () => {
        const { Params } = await import("../src/core/Params.ts");
        const order: string[] = [];
        function node(name: string, ...sources: { params: InstanceType<typeof Params> }[]) {
            const obj = {
                params: undefined as unknown as InstanceType<typeof Params>,
                rebuild: () => order.push(name),
            };
            obj.params = new Params(obj);
            for (const s of sources) obj.params.dependOn(s);
            return obj;
        }
        const a = node("a");
        (a.params as InstanceType<typeof Params>).define("R", 1, { triggers: "rebuild" });
        const b = node("b", a);
        const c = node("c", a);
        node("d", b, c);

        (a as unknown as { R: number }).R = 2;

        expect(order[0]).toBe("a");
        expect(order.filter((n) => n === "d")).toHaveLength(1); // diamond fires once
        expect(order.indexOf("d")).toBeGreaterThan(order.indexOf("b"));
        expect(order.indexOf("d")).toBeGreaterThan(order.indexOf("c"));
    });
});
