/**
 * Sampling of graph curves Γ(θ) = (θ, p(θ)) in S¹ × D².
 *
 * These curves are never arbitrary knots: they are graphs over S¹, meeting
 * each meridional disk {θ} × D² exactly once. All intersection logic
 * therefore happens per-θ in the fiber disk (see analysis/), never by 3D
 * collision.
 */

import type { DiskLoop, GraphCurve, CurveRole } from "./types.ts";
import { vec2 } from "./types.ts";

export function createGraphCurve(
    N: number,
    role: CurveRole,
    label = "",
): GraphCurve {
    const theta = new Float32Array(N);
    for (let i = 0; i < N; i++) theta[i] = (2 * Math.PI * i) / N;
    return { N, theta, disk: new Float32Array(2 * N), role, label };
}

/**
 * Refill an existing curve from a loop — the hot path. Zero allocation, so
 * this can run per frame while a proof parameter animates.
 */
export function refillGraphCurve(curve: GraphCurve, loop: DiskLoop): void {
    const p = refillScratch;
    for (let i = 0; i < curve.N; i++) {
        loop(curve.theta[i]!, p);
        curve.disk[2 * i] = p.x;
        curve.disk[2 * i + 1] = p.y;
    }
}
const refillScratch = vec2();

export function sampleGraphCurve(
    loop: DiskLoop,
    N: number,
    role: CurveRole,
    label = "",
): GraphCurve {
    const curve = createGraphCurve(N, role, label);
    refillGraphCurve(curve, loop);
    return curve;
}
