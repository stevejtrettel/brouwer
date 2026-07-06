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
import { findCollision } from "../analysis/collisionFinder.ts";
import type { DifferenceField, WindingTransition } from "../analysis/collisionFinder.ts";
import { findFieldZeros } from "../analysis/degree.ts";
import type { PlaneField } from "../analysis/degree.ts";
import { createDiskGrid, pushforwardInto, orientationCounts } from "../diskGrid.ts";
import type { OrientationCounts } from "../diskGrid.ts";
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

export function brouwerModel(f: DiskMap): ProofModel {
    // the fixed-point census depends only on f (not on r), so cache it and
    // recompute only when the map's parameters actually change
    let censusKey = "";
    let census: FixedPointCensus | null = null;
    const getCensus = (): FixedPointCensus => {
        const key = JSON.stringify(f.params);
        if (census === null || key !== censusKey) {
            census = findAllFixedPoints(f);
            censusKey = key;
        }
        return census;
    };

    // fold census (discrete Jacobian over a triangulated disk) — also a
    // property of f alone, cached the same way
    let foldsKey = "";
    let folds: OrientationCounts | null = null;
    const foldGrid = createDiskGrid(32, 64);
    const foldPositions = new Float32Array(2 * foldGrid.V);
    const getFolds = (): OrientationCounts => {
        const key = JSON.stringify(f.params);
        if (folds === null || key !== foldsKey) {
            pushforwardInto(foldGrid, f, 0, foldPositions);
            folds = orientationCounts(foldGrid, foldPositions);
            foldsKey = key;
        }
        return folds;
    };

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
            const { fixedPoints, indexSum, degenerate } = getCensus();
            return [
                { name: "min |f − i|", value: min, display: min.toFixed(3) },
                {
                    name: "Lk(Γf, Γi)",
                    value: link.raw,
                    display: link.lk === null ? "—" : String(link.lk),
                },
                {
                    name: "fixed points",
                    value: fixedPoints.length,
                    display: degenerate ? "∞ (f ≈ id on a region)" : String(fixedPoints.length),
                },
                {
                    // is f an embedding, or does the image fold over itself?
                    name: "folds",
                    value: getFolds().foldFraction,
                    display:
                        getFolds().reversing === 0
                            ? "none"
                            : `${(100 * getFolds().foldFraction).toFixed(0)}% reversed`,
                },
                {
                    // Lefschetz: the displacement indices always sum to 1
                    name: "Σ index",
                    value: indexSum ?? NaN,
                    display:
                        indexSum === null
                            ? "—"
                            : indexSum === 1
                              ? "1 = L(f) ✓"
                              : `${indexSum} ✗ (should be 1)`,
                },
            ];
        },

        landmarks() {
            return getCensus().fixedPoints.map((fp) => ({
                theta: fp.theta,
                disk: fp.x,
                index: fp.index,
                label: `fixed point (index ${fp.index ?? "?"})`,
            }));
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

    const fixedPoints = zeros
        .filter((z) => Math.hypot(z.x, z.y) <= 1 + 1e-9)
        .map((z) => ({
            x: vec2(z.x, z.y),
            r: Math.hypot(z.x, z.y),
            theta: ((Math.atan2(z.y, z.x) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
            index: z.index,
            residual: z.residual,
        }));
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
