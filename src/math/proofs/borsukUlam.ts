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

import type { GraphCurve, LabeledLoop, Vec2 } from "../types.ts";
import { vec2, vec3 } from "../types.ts";
import type { SphereDiskMap } from "../maps/sphereMaps.ts";
import { spherePoint } from "../maps/sphereMaps.ts";
import type { MeterReading, ProofEvent, ProofModel } from "./types.ts";
import { labeled } from "./types.ts";
import { graphDistanceAtIndex } from "../analysis/collisions.ts";
import { relativeWinding } from "../analysis/winding.ts";

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
    };
}

function midpoint(a: GraphCurve, b: GraphCurve, i: number): Vec2 {
    return vec2(
        (a.disk[2 * i]! + b.disk[2 * i]!) / 2,
        (a.disk[2 * i + 1]! + b.disk[2 * i + 1]!) / 2,
    );
}
