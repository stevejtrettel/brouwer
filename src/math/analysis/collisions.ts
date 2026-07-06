/**
 * Collision detection in the fiber disk (math spec §7.1–7.2).
 *
 * Graph curves meet iff they agree at the same θ, so intersection reduces to
 * the pointwise distance |p₁(θ) − p₂(θ)|; a curve crosses the core iff
 * |p(θ)| ≈ 0. These detectors illustrate the theorems — the proofs are
 * topological, and nothing downstream should treat ε-closeness as a
 * certificate.
 */

import type { GraphCurve } from "../types.ts";

export interface ClosestApproach {
    /** sample index of the minimum */
    index: number;
    theta: number;
    distance: number;
}

/** |p_a(θᵢ) − p_b(θᵢ)| at one sample. */
export function graphDistanceAtIndex(
    a: GraphCurve,
    b: GraphCurve,
    i: number,
): number {
    return Math.hypot(
        a.disk[2 * i]! - b.disk[2 * i]!,
        a.disk[2 * i + 1]! - b.disk[2 * i + 1]!,
    );
}

/** Minimum same-θ distance between two graph curves. */
export function closestApproach(a: GraphCurve, b: GraphCurve): ClosestApproach {
    const N = Math.min(a.N, b.N);
    let best = Infinity;
    let bestI = 0;
    for (let i = 0; i < N; i++) {
        const d = graphDistanceAtIndex(a, b, i);
        if (d < best) {
            best = d;
            bestI = i;
        }
    }
    return { index: bestI, theta: a.theta[bestI]!, distance: best };
}

/** |p(θᵢ)| — distance from the core at one sample. */
export function coreDistanceAtIndex(c: GraphCurve, i: number): number {
    return Math.hypot(c.disk[2 * i]!, c.disk[2 * i + 1]!);
}

/** Minimum distance from the core along the curve. */
export function closestCoreApproach(c: GraphCurve): ClosestApproach {
    let best = Infinity;
    let bestI = 0;
    for (let i = 0; i < c.N; i++) {
        const d = coreDistanceAtIndex(c, i);
        if (d < best) {
            best = d;
            bestI = i;
        }
    }
    return { index: bestI, theta: c.theta[bestI]!, distance: best };
}
