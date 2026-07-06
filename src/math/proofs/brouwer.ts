/**
 * Brouwer fixed point theorem (math spec §2).
 *
 * For f: D² → D² and each radius r ∈ (0, 1], restrict to the circle of
 * radius r:
 *
 *     f_r(θ) = f(r cos θ, r sin θ),      i_r(θ) = r(cos θ, sin θ).
 *
 * A fixed point is exactly a same-θ collision of the two graph curves
 * Γ_f(r) and Γ_i(r) for some r.
 */

import type { GraphCurve, LabeledLoop, Vec2 } from "../types.ts";
import { set2, vec2 } from "../types.ts";
import type { DiskMap } from "../maps/diskMaps.ts";
import type { MeterReading, ProofEvent, ProofModel } from "./types.ts";
import { labeled } from "./types.ts";
import { graphDistanceAtIndex } from "../analysis/collisions.ts";
import { linkingNumber } from "../analysis/linking.ts";

/** The restriction i_r as a DiskLoop. */
export function identityLoop(r: number): LabeledLoop {
    return labeled(
        (theta, out) => set2(out, r * Math.cos(theta), r * Math.sin(theta)),
        "identity",
        `i_${formatR(r)}`,
    );
}

/** The restriction f_r as a DiskLoop. */
export function mapLoop(f: DiskMap, r: number, time = 0): LabeledLoop {
    const x = vec2();
    return labeled(
        (theta, out) => {
            set2(x, r * Math.cos(theta), r * Math.sin(theta));
            f.evalDisk(x, time, out);
        },
        "map",
        `f_${formatR(r)}`,
    );
}

function formatR(r: number): string {
    return r.toFixed(2);
}

export function brouwerModel(f: DiskMap): ProofModel {
    return {
        id: "brouwer",
        title: "Brouwer fixed point theorem",
        paramName: "r",
        paramRange: [0.02, 1],
        paramDefault: 0.6,

        loopsAt(r: number): LabeledLoop[] {
            return [identityLoop(r), mapLoop(f, r)];
        },

        detect(_r, curves, epsilon): ProofEvent[] {
            const [gi, gf] = curves as [GraphCurve, GraphCurve];
            const events: ProofEvent[] = [];
            // report each local minimum below ε, not just the global one —
            // a map can have several fixed points on one circle
            const N = Math.min(gi.N, gf.N);
            for (let i = 0; i < N; i++) {
                const d = graphDistanceAtIndex(gi, gf, i);
                if (d >= epsilon) continue;
                const prev = graphDistanceAtIndex(gi, gf, (i + N - 1) % N);
                const next = graphDistanceAtIndex(gi, gf, (i + 1) % N);
                if (d <= prev && d <= next) {
                    events.push({
                        kind: "fixed-point",
                        index: i,
                        theta: gi.theta[i]!,
                        error: d,
                        disk: midpoint(gi, gf, i),
                    });
                }
            }
            return events;
        },

        meters(curves): MeterReading[] {
            const [gi, gf] = curves as [GraphCurve, GraphCurve];
            let min = Infinity;
            for (let i = 0; i < Math.min(gi.N, gf.N); i++) {
                min = Math.min(min, graphDistanceAtIndex(gi, gf, i));
            }
            // Lk(Γ_f, Γ_i) = winding of the displacement f − i (linking.ts);
            // this IS the proof invariant: 0 near r = 0, 1 at r = 1
            const link = linkingNumber(gf, gi);
            return [
                { name: "min |f − i|", value: min, display: min.toFixed(3) },
                {
                    name: "Lk(Γf, Γi)",
                    value: link.raw,
                    display: link.lk === null ? "—" : String(link.lk),
                },
            ];
        },

        status(curves): string {
            const [gi, gf] = curves as [GraphCurve, GraphCurve];
            const link = linkingNumber(gf, gi);
            if (link.lk === null) {
                return `curves touch — fixed point! (min |f − i| = ${link.separation.toFixed(3)})`;
            }
            return link.lk === 0
                ? "unlinked · Lk = 0"
                : `linked · Lk = ${link.lk}`;
        },
    };
}

function midpoint(a: GraphCurve, b: GraphCurve, i: number): Vec2 {
    return vec2(
        (a.disk[2 * i]! + b.disk[2 * i]!) / 2,
        (a.disk[2 * i + 1]! + b.disk[2 * i + 1]!) / 2,
    );
}
