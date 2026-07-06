/**
 * Sphere-to-disk maps f: S² → D² for Borsuk–Ulam (math spec §5.2).
 *
 * Spherical coordinates follow the paper:
 *
 *     x(φ, θ) = (sin φ cos θ, sin φ sin θ, cos φ),
 *
 * φ = 0 north pole, φ = π/2 equator, φ = π south pole.
 */

import type { Vec2, Vec3 } from "../types.ts";
import { set2, set3, vec2 } from "../types.ts";
import { softClampToDisk } from "./project.ts";

export interface SphereDiskMap {
    id: string;
    name: string;
    params: Record<string, number>;
    evalSphere(x: Vec3, time: number, out: Vec2): Vec2;
}

/** The point x(φ, θ) on the unit sphere. */
export function spherePoint(phi: number, theta: number, out: Vec3): Vec3 {
    const s = Math.sin(phi);
    return set3(out, s * Math.cos(theta), s * Math.sin(theta), Math.cos(phi));
}

/** Equatorial projection f(x, y, z) = (x, y). */
export function equatorialProjection(): SphereDiskMap {
    return {
        id: "projection",
        name: "projection (x, y)",
        params: {},
        evalSphere: (x, _t, out) => set2(out, x.x, x.y),
    };
}

/**
 * Height-distorted projection f(x, y, z) = a(z)·(x, y) with a(z) = 1 + k·z,
 * soft-clamped. k breaks the north/south symmetry so f(N) ≠ f(S) stories
 * work; k = 0 recovers plain projection.
 */
export function distortedProjection(k = 0.6): SphereDiskMap {
    const params = { k };
    const tmp = vec2();
    return {
        id: "distorted-projection",
        name: "distorted projection",
        params,
        evalSphere: (x, _t, out) => {
            const a = 1 + params.k * x.z;
            set2(tmp, a * x.x, a * x.y);
            return softClampToDisk(out, tmp);
        },
    };
}

/**
 * Low-frequency "harmonic" toy map: perturb the projection with degree-2
 * spherical polynomials, f = clamp(x + α·2xz, y + α·(x² − y²)). Visually
 * interesting graph curves without losing continuity.
 */
export function harmonicMap(alpha = 0.8): SphereDiskMap {
    const params = { alpha };
    const tmp = vec2();
    return {
        id: "harmonic",
        name: "harmonic perturbation",
        params,
        evalSphere: (x, _t, out) => {
            set2(
                tmp,
                x.x + params.alpha * 2 * x.x * x.z,
                x.y + params.alpha * (x.x * x.x - x.y * x.y),
            );
            return softClampToDisk(out, tmp);
        },
    };
}
