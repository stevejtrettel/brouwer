/**
 * Borsuk–Ulam theorem (math spec §3).
 *
 * For f: S² → D², graph the latitude restriction and its antipodal
 * companion:
 *
 *     Γ_f(φ, θ)  = (θ, f(x(φ, θ))),
 *     Γ_f̄(φ, θ) = (θ, f(−x(φ, θ))) = (θ, f(x(π − φ, θ + π))).
 *
 * A Borsuk–Ulam pair f(x) = f(−x) is a same-θ collision of the two curves.
 * At the equator the companion is the half-turn shift f_eq(θ + π), and the
 * segment ribbon joining the curves carries an odd twist — reported here as
 * the relative winding meter.
 */

import type { GraphCurve, LabeledLoop, Vec2, Vec3 } from "../types.ts";
import { vec2, vec3 } from "../types.ts";
import type { SphereDiskMap } from "../maps/sphereMaps.ts";
import { spherePoint } from "../maps/sphereMaps.ts";
import type { MeterReading, ProofEvent, ProofModel } from "./types.ts";
import { labeled } from "./types.ts";
import { graphDistanceAtIndex } from "../analysis/collisions.ts";
import { relativeWinding } from "../analysis/winding.ts";
import { linkingNumber } from "../analysis/linking.ts";
import { findCollision } from "../analysis/collisionFinder.ts";
import type { DifferenceField, WindingTransition } from "../analysis/collisionFinder.ts";

/** Γ_f(φ): the graph of f restricted to the latitude φ. */
export function latitudeGraphLoop(
    f: SphereDiskMap,
    phi: number,
    time = 0,
): LabeledLoop {
    const x = vec3();
    return labeled(
        (theta, out) => {
            spherePoint(phi, theta, x);
            f.evalSphere(x, time, out);
        },
        "map",
        "f",
    );
}

/** Γ_f̄(φ): the antipodal companion, via −x(φ, θ) = x(π − φ, θ + π). */
export function antipodalGraphLoop(
    f: SphereDiskMap,
    phi: number,
    time = 0,
): LabeledLoop {
    const x = vec3();
    return labeled(
        (theta, out) => {
            spherePoint(Math.PI - phi, theta + Math.PI, x);
            f.evalSphere(x, time, out);
        },
        "antipodal-map",
        "f̄",
    );
}

export function borsukUlamModel(f: SphereDiskMap): ProofModel {
    return {
        id: "borsuk-ulam",
        title: "Borsuk–Ulam theorem",
        paramName: "φ",
        paramRange: [0.02, Math.PI / 2],
        paramDefault: Math.PI / 2,

        loopsAt(phi: number): LabeledLoop[] {
            return [latitudeGraphLoop(f, phi), antipodalGraphLoop(f, phi)];
        },

        detect(_phi, curves, epsilon): ProofEvent[] {
            const [gf, gfbar] = curves as [GraphCurve, GraphCurve];
            const events: ProofEvent[] = [];
            const N = Math.min(gf.N, gfbar.N);
            for (let i = 0; i < N; i++) {
                const d = graphDistanceAtIndex(gf, gfbar, i);
                if (d >= epsilon) continue;
                const prev = graphDistanceAtIndex(gf, gfbar, (i + N - 1) % N);
                const next = graphDistanceAtIndex(gf, gfbar, (i + 1) % N);
                if (d <= prev && d <= next) {
                    events.push({
                        kind: "antipodal-pair",
                        index: i,
                        theta: gf.theta[i]!,
                        error: d,
                        disk: midpoint(gf, gfbar, i),
                    });
                }
            }
            return events;
        },

        meters(curves): MeterReading[] {
            const [gf, gfbar] = curves as [GraphCurve, GraphCurve];
            let min = Infinity;
            for (let i = 0; i < Math.min(gf.N, gfbar.N); i++) {
                min = Math.min(min, graphDistanceAtIndex(gf, gfbar, i));
            }
            const twist = relativeWinding(gf, gfbar);
            return [
                { name: "min |f − f̄|", value: min, display: min.toFixed(3) },
                // meaningless when the curves touch — the UI should warn there
                { name: "twist", value: twist, display: twist.toFixed(2) },
            ];
        },

        status(curves): string {
            const [gf, gfbar] = curves as [GraphCurve, GraphCurve];
            // the twist IS the linking number of the two graph curves
            const link = linkingNumber(gf, gfbar);
            if (link.lk === null) {
                return `curves touch — antipodal pair! (min |f − f̄| = ${link.separation.toFixed(3)})`;
            }
            return link.lk === 0
                ? "unlinked · twist = 0"
                : `linked · twist = ${link.lk}`;
        },
    };
}

// ---------------------------------------------------------------- finder

export interface AntipodalPairResult {
    /** true when the residual is at solver precision */
    found: boolean;
    /** the point x on the sphere with f(x) = f(−x); the pair is (x, −x) */
    x: Vec3;
    phi: number;
    theta: number;
    /** the shared disk value f(x) = f(−x) */
    value: Vec2;
    /** |f(x) − f(−x)| */
    residual: number;
    /** the twist transition that localized it (null for degenerate maps
     *  whose twist never changes, e.g. odd maps with pole pairs) */
    transition: WindingTransition | null;
}

/**
 * Find an antipodal pair f(x) = f(−x) the way the proof does
 * (collisionFinder.ts): bisect the latitude interval where the twist of
 * (Γ_f, Γ_f̄) jumps, then Newton-trace the collision
 * d(φ, θ) = f(x(φ,θ)) − f(x(π−φ, θ+π)) = 0 to machine precision.
 */
export function findAntipodalPair(
    f: SphereDiskMap,
    options: { time?: number } = {},
): AntipodalPairResult {
    const time = options.time ?? 0;
    const x = vec3();
    const xbar = vec3();
    const fx = vec2();
    const d: DifferenceField = (phi, theta, out) => {
        spherePoint(phi, theta, x);
        spherePoint(Math.PI - phi, theta + Math.PI, xbar);
        f.evalSphere(x, time, fx);
        f.evalSphere(xbar, time, out);
        out.x = fx.x - out.x;
        out.y = fx.y - out.y;
    };

    const result = findCollision(d, [0.02, Math.PI / 2], {
        sClamp: [1e-3, Math.PI / 2],
    });

    spherePoint(result.s, result.theta, x);
    f.evalSphere(x, time, fx);
    return {
        found: result.residual < 1e-8,
        x: vec3(x.x, x.y, x.z),
        phi: result.s,
        theta: result.theta,
        value: vec2(fx.x, fx.y),
        residual: result.residual,
        transition: result.transition,
    };
}

function midpoint(a: GraphCurve, b: GraphCurve, i: number): Vec2 {
    return vec2(
        (a.disk[2 * i]! + b.disk[2 * i]!) / 2,
        (a.disk[2 * i + 1]! + b.disk[2 * i + 1]!) / 2,
    );
}
