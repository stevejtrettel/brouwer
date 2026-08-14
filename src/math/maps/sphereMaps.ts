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
 * Offset projection f(x, y, z) = clamp(x + c·z + bx, y + by) — the
 * canonical NON-degenerate Borsuk–Ulam example.
 *
 * The odd term c·z separates the pole values (f(N) ≈ (c + bx, by) vs
 * f(S) ≈ (−c + bx, by)), so small latitudes give honestly unlinked graph
 * curves with twist 0, while the equator keeps its forced odd twist — the
 * transition, and the antipodal pair, happen at an interior latitude.
 *
 * The even offset (bx, by) matters too: the difference f(x) − f(−x) only
 * sees the ODD part of f, so for an odd map (any pure projection) every
 * antipodal pair has value exactly 0 — the collision always happens at the
 * disk center. (bx, by) breaks oddness and moves the shared value somewhere
 * generic.
 */
export function offsetProjection(c = 0.35, bx = 0.1, by = 0.15): SphereDiskMap {
    const params = { c, bx, by };
    const tmp = vec2();
    return {
        id: "offset-projection",
        name: "offset projection",
        params,
        evalSphere: (x, _t, out) => {
            set2(tmp, x.x + params.c * x.z + params.bx, x.y + params.by);
            return softClampToDisk(out, tmp);
        },
    };
}

/**
 * Height-distorted projection f(x, y, z) = a(z)·(x, y) with a(z) = 1 + k·z,
 * soft-clamped. NOTE: this map is degenerate as a Borsuk–Ulam example —
 * both poles map to 0, so f(N) = f(S) trivially, the antipodal pair sits at
 * the poles, and the twist is odd at EVERY latitude (no unlinked phase).
 * Kept as a preset precisely to contrast with offsetProjection.
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
 * Power projection: f = clamp((x + iy)^k + c·z + b) — the offset
 * projection with the equator wound k times. On the equator w = x + iy has
 * |w| = 1, so f_eq winds k× around the (offset) origin and the swept
 * ribbon is a k-TWISTED Möbius band. k must be ODD: for even k,
 * (−w)^k = w^k makes f = f̄ on the whole equator (degenerate). k = 1 is
 * exactly offsetProjection.
 */
export function powerProjection(k = 1, c = 0.35, bx = 0.1, by = 0.15, psi = 0): SphereDiskMap {
    const params = { k, c, bx, by, psi };
    const tmp = vec2();
    return {
        id: "power-projection",
        name: "power projection wᵏ",
        params,
        evalSphere: (x, _t, out) => {
            // ψ spins the DOMAIN about the polar axis. Pure staging — it
            // changes no invariant — but θ is also the way around the torus,
            // so it decides where in the FRAME the interesting things happen.
            // Unrotated, the odd part x + c·z vanishes on the y = 0 meridian,
            // which puts the antipodal pair (and the twist flip around it) at
            // θ = π: the far side, small and half occluded, in every figure.
            const cos = Math.cos(params.psi);
            const sin = Math.sin(params.psi);
            const px = cos * x.x + sin * x.y;
            const py = -sin * x.x + cos * x.y;
            const r = Math.hypot(px, py);
            const kk = Math.round(params.k);
            const ang = kk * Math.atan2(py, px);
            const mag = r ** kk;
            set2(
                tmp,
                mag * Math.cos(ang) + params.c * x.z + params.bx,
                mag * Math.sin(ang) + params.by,
            );
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
