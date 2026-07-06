/**
 * Winding numbers in the fiber disk (math spec §7.3).
 *
 * For a disk-valued loop p(θ) that avoids the origin, the winding number is
 *
 *     w = (1/2π) Σᵢ wrapToPi(α(θᵢ₊₁) − α(θᵢ)),   α = arg p,
 *
 * summed cyclically over the closed sample sequence. For a genuinely
 * nonvanishing continuous loop, adequately sampled, this is an exact
 * integer. Used for the Poincaré winding meter (p around the core) and the
 * Borsuk twist meter (winding of the difference d(θ) = p₁(θ) − p₂(θ)).
 *
 * These meters are explanatory, not proof engines: near-zero |p| means the
 * number reported is numerically meaningless, so we also expose the minimum
 * modulus for the UI to warn on.
 */

import type { GraphCurve } from "../types.ts";
import { wrapToPi } from "./unwrap.ts";

/** Winding of the curve's disk point around the origin (the core). */
export function windingNumber(curve: GraphCurve): number {
    const { N, disk } = curve;
    let total = 0;
    let prev = Math.atan2(disk[1]!, disk[0]!);
    for (let i = 1; i <= N; i++) {
        const j = i % N;
        const angle = Math.atan2(disk[2 * j + 1]!, disk[2 * j]!);
        total += wrapToPi(angle - prev);
        prev = angle;
    }
    return total / (2 * Math.PI);
}

/**
 * Winding of the difference d(θ) = a(θ) − b(θ) around 0: the twist of the
 * segment ribbon joining the two curves (math spec §3.3). Odd for the
 * Borsuk–Ulam equator pair.
 */
export function relativeWinding(a: GraphCurve, b: GraphCurve): number {
    const N = Math.min(a.N, b.N);
    let total = 0;
    let prev = Math.atan2(a.disk[1]! - b.disk[1]!, a.disk[0]! - b.disk[0]!);
    for (let i = 1; i <= N; i++) {
        const j = i % N;
        const du = a.disk[2 * j]! - b.disk[2 * j]!;
        const dv = a.disk[2 * j + 1]! - b.disk[2 * j + 1]!;
        const angle = Math.atan2(dv, du);
        total += wrapToPi(angle - prev);
        prev = angle;
    }
    return total / (2 * Math.PI);
}
