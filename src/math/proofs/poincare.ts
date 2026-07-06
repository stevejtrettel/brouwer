/**
 * Poincaré / hairy-ball theorem (math spec §4).
 *
 * A tangent field v on S² restricted to a loop γ becomes a disk-valued loop
 * p_γ(θ) via the moving frame (frames.ts). The graph curve crosses the core
 * exactly where v has a zero on γ.
 *
 * Phase 1 uses the latitude family γ_φ: as φ sweeps 0 → π the loops sweep
 * the whole sphere, and any nonvanishing field would have to interpolate
 * winding +1 (small north-pole loop) to winding −1 (small south-pole loop,
 * which is the reversed orientation seen from the frame) without ever
 * crossing the core — impossible. The full loop-homotopy storyboard of
 * spec §4.2 arrives in Phase 4; the ProofModel interface already carries it
 * (the parameter is just reinterpreted).
 */

import type { GraphCurve, LabeledLoop } from "../types.ts";
import { vec2 } from "../types.ts";
import type { TangentVectorField } from "../maps/tangentFields.ts";
import { latitudeLoop, tangentGraphLoop } from "../frames.ts";
import type { MeterReading, ProofEvent, ProofModel } from "./types.ts";
import { labeled } from "./types.ts";
import { coreDistanceAtIndex } from "../analysis/collisions.ts";
import { windingNumber } from "../analysis/winding.ts";

export function poincareModel(field: TangentVectorField): ProofModel {
    return {
        id: "poincare",
        title: "Poincaré / hairy-ball theorem",
        paramName: "φ",
        paramRange: [0.05, Math.PI - 0.05],
        paramDefault: 0.4,

        loopsAt(phi: number): LabeledLoop[] {
            const loop = tangentGraphLoop(field, latitudeLoop(phi));
            return [labeled(loop, "vector-field", "v∘γ")];
        },

        detect(_phi, curves, epsilon): ProofEvent[] {
            const [g] = curves as [GraphCurve];
            const events: ProofEvent[] = [];
            for (let i = 0; i < g.N; i++) {
                const d = coreDistanceAtIndex(g, i);
                if (d >= epsilon) continue;
                const prev = coreDistanceAtIndex(g, (i + g.N - 1) % g.N);
                const next = coreDistanceAtIndex(g, (i + 1) % g.N);
                if (d <= prev && d <= next) {
                    events.push({
                        kind: "core-crossing",
                        index: i,
                        theta: g.theta[i]!,
                        error: d,
                        disk: vec2(g.disk[2 * i]!, g.disk[2 * i + 1]!),
                    });
                }
            }
            return events;
        },

        meters(curves): MeterReading[] {
            const [g] = curves as [GraphCurve];
            let min = Infinity;
            for (let i = 0; i < g.N; i++) {
                min = Math.min(min, coreDistanceAtIndex(g, i));
            }
            const w = windingNumber(g);
            return [
                { name: "min |v|", value: min, display: min.toFixed(3) },
                // near-integer when the graph stays away from the core;
                // meaningless (and flagged by min |v|) when it doesn't
                { name: "winding", value: w, display: w.toFixed(2) },
            ];
        },
    };
}
