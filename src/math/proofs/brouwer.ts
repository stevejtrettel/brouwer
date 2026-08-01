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

import type { LabeledLoop, Vec2 } from "../types.ts";
import { set2, vec2 } from "../types.ts";
import type { DiskMap } from "../maps/diskMaps.ts";
import { labeled } from "./types.ts";
import { findCollision } from "../analysis/collisionFinder.ts";
import type { DifferenceField, WindingTransition } from "../analysis/collisionFinder.ts";
import { findFieldZeros } from "../analysis/degree.ts";
import type { PlaneField } from "../analysis/degree.ts";
import type { CensusOptions } from "../analysis/degree.ts";

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

// ---------------------------------------------------------------- census

export interface DiskFixedPoint {
    x: Vec2;
    r: number;
    theta: number;
    /** local index of the displacement field (+1 node, −1 saddle) */
    index: number | null;
    residual: number;
}

export interface FixedPointCensus {
    fixedPoints: DiskFixedPoint[];
    /** Lefschetz: Σ = 1 for any continuous f: D² → D² with isolated fixed points */
    indexSum: number | null;
    /** true when the displacement vanishes on a whole region (f ≈ id
     *  somewhere) — fixed points are then a continuum, not a finite list */
    degenerate: boolean;
}

/**
 * Find ALL fixed points of f via the degree census (degree.ts) of the
 * displacement field F(x) = f(x) − x over a box enclosing the disk. No
 * fixed point of nonzero index can be missed (a region containing one has
 * nonzero boundary degree); cancelling ±1 pairs finer than the subdivision
 * floor can — see degree.ts.
 */
export function findAllFixedPoints(
    f: DiskMap,
    time = 0,
    options: CensusOptions = {},
): FixedPointCensus {
    const p = vec2();
    const F: PlaneField = (x, y, out) => {
        set2(p, x, y);
        f.evalDisk(p, time, out);
        out.x -= x;
        out.y -= y;
    };

    // degeneracy check: an identity-like map has F ≡ 0 on a region, where
    // fixed points form a continuum — the census (and degree pruning
    // itself) is meaningless there, so report honestly instead of grinding.
    // Probe INSIDE the disk only: outside, any disk-valued f forces
    // F = f(x) − x ≠ 0, which would mask the degeneracy (and once did —
    // the at-rest playground ground through the whole cell budget).
    const probe = vec2();
    let maxNorm = 0;
    for (let ring = 0; ring <= 4; ring++) {
        const r = 0.95 * (ring / 4);
        for (let j = 0; j < 8; j++) {
            const angle = (2 * Math.PI * j) / 8 + ring;
            F(r * Math.cos(angle), r * Math.sin(angle), probe);
            maxNorm = Math.max(maxNorm, Math.hypot(probe.x, probe.y));
        }
    }
    if (maxNorm < 1e-9) {
        return { fixedPoints: [], indexSum: null, degenerate: true };
    }

    // enclosing box: since f maps into D², |F| ≥ |x| − 1 > 0 outside the
    // disk, so the extra area contributes no spurious zeros. Raise
    // options.minDepth to resolve tightly cancelling ±1 pairs (e.g. the
    // fixed-point pairs that folded maps put right next to their creases).
    const { zeros, indexSum, truncated } = findFieldZeros(
        F,
        { x0: -1.05, y0: -1.05, x1: 1.05, y1: 1.05 },
        options,
    );

    // fixed points pinned exactly on ∂D² are common (any drag that presses
    // the sheet against the boundary clamp balances there) and are located
    // only to cell accuracy — allow that slack, then report ON the disk
    const fixedPoints = zeros
        .filter((z) => Math.hypot(z.x, z.y) <= 1.02)
        .map((z) => {
            const r = Math.hypot(z.x, z.y);
            const clamp = r > 1 ? 1 / r : 1;
            return {
                x: vec2(z.x * clamp, z.y * clamp),
                r: Math.min(r, 1),
                theta: ((Math.atan2(z.y, z.x) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
                index: z.index,
                residual: z.residual,
            };
        });
    return { fixedPoints, indexSum, degenerate: truncated };
}

// ---------------------------------------------------------------- finder

export interface FixedPointResult {
    /** true when the residual is at solver precision */
    found: boolean;
    /** the fixed point x* = r·e^{iθ} with f(x*) = x* */
    x: Vec2;
    r: number;
    theta: number;
    /** |f(x*) − x*| */
    residual: number;
    /** the linking transition that localized it (null for center-degenerate maps) */
    transition: WindingTransition | null;
}

/**
 * Find a fixed point of f the way the proof does (collisionFinder.ts):
 * bisect the r-interval where Lk(Γ_f, Γ_i) jumps, then Newton-trace the
 * collision d(r, θ) = f(r·e^{iθ}) − r·e^{iθ} = 0 to machine precision.
 *
 * Finds ONE fixed point (the first transition bracketed by the coarse scan);
 * maps with several have the others at different transitions or windings.
 */
export function findBrouwerFixedPoint(
    f: DiskMap,
    options: { rMax?: number; time?: number } = {},
): FixedPointResult {
    const rMax = options.rMax ?? 1;
    const time = options.time ?? 0;
    const x = vec2();
    const d: DifferenceField = (r, theta, out) => {
        set2(x, r * Math.cos(theta), r * Math.sin(theta));
        f.evalDisk(x, time, out);
        out.x -= x.x;
        out.y -= x.y;
    };

    // scan starts just off r = 0 (where every d-loop degenerates to a point);
    // Newton may still walk down to r = 0 for center fixed points
    const result = findCollision(d, [1e-3, rMax], { sClamp: [0, rMax] });

    return {
        found: result.residual < 1e-8,
        x: vec2(result.s * Math.cos(result.theta), result.s * Math.sin(result.theta)),
        r: result.s,
        theta: result.theta,
        residual: result.residual,
        transition: result.transition,
    };
}
