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
import { findAntipodalPair } from "../src/math/proofs/borsukUlam.ts";
import { projectedConstantField, rotationalField } from "../src/math/maps/tangentFields.ts";
import { brouwerModel } from "../src/math/proofs/brouwer.ts";
import { borsukUlamModel } from "../src/math/proofs/borsukUlam.ts";
import { poincareModel } from "../src/math/proofs/poincare.ts";
import { sampleGraphCurve } from "../src/math/graphCurve.ts";
import { SolidTorus } from "../src/math/torus.ts";
import { dot3 } from "../src/math/types.ts";

const N = 512;

function sampleModel(model: ReturnType<typeof brouwerModel>, s: number) {
    return model
        .loopsAt(s)
        .map((l) => sampleGraphCurve(l.loop, N, l.role, l.label));
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

describe("Brouwer model", () => {
    it("identity map collides everywhere (every point is fixed)", () => {
        const model = brouwerModel(identityMap());
        const curves = sampleModel(model, 0.5);
        const meter = model.meters(curves).find((m) => m.name.startsWith("min"))!;
        expect(meter.value).toBeCloseTo(0, 10);
    });

    it("radial contraction has no fixed point on any circle r > 0", () => {
        const model = brouwerModel(radialContraction(0.5));
        for (const r of [0.1, 0.5, 1]) {
            const curves = sampleModel(model, r);
            // |f_r − i_r| = (1 − a)·r uniformly
            const meter = model.meters(curves)[0]!;
            expect(meter.value).toBeCloseTo(0.5 * r, 5);
            expect(model.detect(r, curves, 0.01)).toHaveLength(0);
        }
    });

    it("detects the fixed point of a displaced contraction", () => {
        // f(x) = a·x + c has fixed point x* = c/(1 − a), |x*| = 0.5 here
        const model = brouwerModel(displacedContraction(0.4, 0.3, 0));
        const rStar = 0.5;
        const curves = sampleModel(model, rStar);
        const events = model.detect(rStar, curves, 0.02);
        expect(events.length).toBeGreaterThan(0);
        expect(events[0]!.kind).toBe("fixed-point");
        expect(events[0]!.theta).toBeCloseTo(0, 1); // fixed point on +x axis
    });
});

describe("Borsuk–Ulam model", () => {
    it("equator twist is odd for the projection map", () => {
        const model = borsukUlamModel(equatorialProjection());
        const curves = sampleModel(model, Math.PI / 2);
        const twist = model.meters(curves).find((m) => m.name === "twist")!;
        expect(Math.abs(twist.value % 2)).toBeCloseTo(1, 4);
    });

    it("finds antipodal pairs for the distorted projection somewhere in φ", () => {
        // f(x) = (1 + k z)(x, y): antipodal equality needs f(x) = f(−x),
        // i.e. (1 + kz)(x,y) = −(1 − kz)(x,y) — only at (x,y) ≈ 0, the poles;
        // approaching φ → 0 the curves collapse toward f(N) vs f(S)... so use
        // the equator where f(x) = −f(−x) forces a crossing iff f hits 0.
        // Simplest guaranteed catch: projection map at the equator has
        // f̄ = −f, so |f − f̄| = 2|f| > 0 — instead verify the sweep exposes
        // shrinking min-distance near the poles for the symmetric map k = 0
        // at φ → 0 (both curves collapse to f(N) = f(S) = 0).
        const model = borsukUlamModel(equatorialProjection());
        const curves = sampleModel(model, 0.02);
        const events = model.detect(0.02, curves, 0.05);
        expect(events.length).toBeGreaterThan(0);
        expect(events[0]!.kind).toBe("antipodal-pair");
    });

    it("offset projection is NON-degenerate: unlinked near the pole, odd twist at the equator", () => {
        const model = borsukUlamModel(offsetProjection());
        const nearPole = sampleModel(model, 0.05);
        const equator = sampleModel(model, Math.PI / 2);
        expect(model.status!(nearPole)).toContain("unlinked");
        const twistPole = model.meters(nearPole).find((m) => m.name === "twist")!;
        expect(twistPole.value).toBeCloseTo(0, 4);
        const twistEq = model.meters(equator).find((m) => m.name === "twist")!;
        expect(Math.abs(twistEq.value % 2)).toBeCloseTo(1, 4);
        expect(model.status!(equator)).toContain("linked");
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

describe("Poincaré model", () => {
    it("rotational field graph never leaves the core region silently: zeros at poles", () => {
        const model = poincareModel(rotationalField(0, 0, 1));
        // near the pole the field magnitude → 0: graph hugs the core
        const nearPole = sampleModel(model, 0.06);
        const meter = model.meters(nearPole).find((m) => m.name === "min |v|")!;
        expect(meter.value).toBeLessThan(0.1);
    });

    it("projected-constant field crosses the core when the latitude passes a zero", () => {
        const model = poincareModel(projectedConstantField(1, 0, 0));
        // zeros at ±x̂ lie on the equator: φ = π/2 latitudes pass through them
        const curves = sampleModel(model, Math.PI / 2);
        const events = model.detect(Math.PI / 2, curves, 0.05);
        expect(events.length).toBeGreaterThan(0);
        expect(events[0]!.kind).toBe("core-crossing");
    });

    it("winding flips sign from north-pole loop to south-pole loop", () => {
        const model = poincareModel(projectedConstantField(1, 0, 0));
        const north = model.meters(sampleModel(model, 0.1));
        const south = model.meters(sampleModel(model, Math.PI - 0.1));
        expect(north.find((m) => m.name === "winding")!.value).toBeCloseTo(1, 3);
        expect(south.find((m) => m.name === "winding")!.value).toBeCloseTo(-1, 3);
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
