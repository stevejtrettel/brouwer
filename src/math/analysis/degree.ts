/**
 * degree — Brouwer degree over plane regions, and the zero census built on it.
 *
 * THE KEY FACT (argument principle for vector fields): for a continuous
 * field F: ℝ² → ℝ² with no zeros on the boundary of a box, the winding of
 * F around ∂box equals the sum of the indices of the zeros inside. So a box
 * with nonzero boundary winding MUST contain a zero — a certificate, not a
 * heuristic.
 *
 * findFieldZeros exploits this with quadtree subdivision:
 *   - boxes with boundary winding ≠ 0 (or with an unreliable boundary,
 *     which usually means a zero sits ON it) are subdivided until small,
 *     then handed to damped Newton;
 *   - boxes with winding 0 are discarded — after a mandatory `minDepth`
 *     of blind subdivision, because winding 0 means the indices CANCEL,
 *     not that the box is empty. A +1/−1 pair closer together than the
 *     minDepth grid can hide; raise minDepth to resolve finer pairs.
 *     Zeros of nonzero index can never hide.
 *
 * Each zero found gets its LOCAL INDEX: the winding of F around a small
 * circle (+1 for sources/sinks/rotations, −1 for saddles, null when the
 * computation is unreliable — e.g. a degenerate zero). The index sum obeys
 * the conservation laws the demos display: Σ = 1 over the disk for a
 * displacement field f − id (Lefschetz), Σ = 2 over S² for a tangent field
 * (Poincaré–Hopf, via sphereFieldZeros.ts).
 *
 * Boundary windings are computed with adaptive edge sampling: any step
 * where the field direction turns by more than π/2 is bisected, so the
 * winding is exact (telescoping) unless refinement bottoms out — which is
 * reported as null rather than guessed.
 */

import type { Vec2 } from "../types.ts";
import { vec2 } from "../types.ts";
import { wrapToPi } from "./unwrap.ts";
import { windingOfLoop } from "./collisionFinder.ts";

/** A plane vector field, evaluated allocation-free. */
export type PlaneField = (x: number, y: number, out: Vec2) => void;

export interface Box {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

export interface BoundaryWinding {
    /** integer winding of F around ∂box, or null when unreliable
     *  (field vanishes on/near the boundary or turns too fast to resolve) */
    winding: number | null;
    /** smallest |F| encountered on the boundary */
    minNorm: number;
}

const MAX_ANGLE_STEP = Math.PI / 2;
const SEGMENT_DEPTH = 14;

/** Winding number of F around the boundary of a box, walked CCW. */
export function boundaryWinding(
    F: PlaneField,
    box: Box,
    samplesPerEdge = 8,
): BoundaryWinding {
    const p = evalScratch;
    let minNorm = Infinity;
    let bad = false;

    const angleAt = (x: number, y: number): number => {
        F(x, y, p);
        const norm = Math.hypot(p.x, p.y);
        if (norm < minNorm) minNorm = norm;
        // below float noise the direction is meaningless — refining would
        // only burn the segment-depth budget on garbage angles
        if (norm < 1e-13) bad = true;
        return Math.atan2(p.y, p.x);
    };

    // signed angle change along a straight boundary segment, bisecting
    // until each step turns by < π/2 (then the wrapped sum telescopes to
    // the exact continuous change)
    const segment = (
        px: number,
        py: number,
        pa: number,
        qx: number,
        qy: number,
        qa: number,
        depth: number,
    ): number => {
        const d = wrapToPi(qa - pa);
        if (Math.abs(d) <= MAX_ANGLE_STEP) return d;
        if (depth === 0 || bad) {
            bad = true;
            return d;
        }
        const mx = (px + qx) / 2;
        const my = (py + qy) / 2;
        const ma = angleAt(mx, my);
        return (
            segment(px, py, pa, mx, my, ma, depth - 1) +
            segment(mx, my, ma, qx, qy, qa, depth - 1)
        );
    };

    // CCW boundary polygon: bottom, right, top, left
    const xs: number[] = [];
    const ys: number[] = [];
    const push = (x: number, y: number) => {
        xs.push(x);
        ys.push(y);
    };
    const { x0, y0, x1, y1 } = box;
    for (let i = 0; i < samplesPerEdge; i++) push(x0 + ((x1 - x0) * i) / samplesPerEdge, y0);
    for (let i = 0; i < samplesPerEdge; i++) push(x1, y0 + ((y1 - y0) * i) / samplesPerEdge);
    for (let i = 0; i < samplesPerEdge; i++) push(x1 - ((x1 - x0) * i) / samplesPerEdge, y1);
    for (let i = 0; i < samplesPerEdge; i++) push(x0, y1 - ((y1 - y0) * i) / samplesPerEdge);

    const angles = xs.map((x, i) => angleAt(x, ys[i]!));
    let total = 0;
    for (let i = 0; i < xs.length; i++) {
        const j = (i + 1) % xs.length;
        total += segment(xs[i]!, ys[i]!, angles[i]!, xs[j]!, ys[j]!, angles[j]!, SEGMENT_DEPTH);
        if (bad) return { winding: null, minNorm };
    }
    return { winding: Math.round(total / (2 * Math.PI)), minNorm };
}

// ------------------------------------------------------------------ census

export interface FieldZero {
    x: number;
    y: number;
    /** |F| at the zero after Newton polishing */
    residual: number;
    /** local index (small-circle winding), or null when unreliable */
    index: number | null;
}

export interface ZeroCensus {
    zeros: FieldZero[];
    /** Σ of local indices, or null if any individual index is unreliable */
    indexSum: number | null;
    /** true when the cell budget was exhausted — results are incomplete.
     *  The classic trigger is a field that vanishes on a whole region
     *  (e.g. the displacement of the identity map), which makes every
     *  boundary unreliable and defeats degree pruning entirely. */
    truncated: boolean;
}

export interface CensusOptions {
    /** blind subdivision floor — resolves cancelling ±1 pairs down to
     *  cells of size diam/2^minDepth (see header) */
    minDepth?: number;
    /** subdivision ceiling before Newton takes over */
    maxDepth?: number;
    samplesPerEdge?: number;
    /** zeros closer than this are merged */
    dedupeTol?: number;
    newtonTol?: number;
    /** hard cap on cells examined (backstop against degenerate fields) */
    maxCells?: number;
}

/** Locate the zeros of F in a box and compute their indices. */
export function findFieldZeros(
    F: PlaneField,
    box: Box,
    options: CensusOptions = {},
): ZeroCensus {
    const minDepth = options.minDepth ?? 2;
    const maxDepth = options.maxDepth ?? 10;
    const samplesPerEdge = options.samplesPerEdge ?? 8;
    const dedupeTol = options.dedupeTol ?? 1e-6;
    const newtonTol = options.newtonTol ?? 1e-11;
    const maxCells = options.maxCells ?? 20_000;

    const zeros: FieldZero[] = [];
    const margin = 0.1 * Math.max(box.x1 - box.x0, box.y1 - box.y0);

    const MAX_ZEROS = 64; // far above any honest census — a degeneracy tripwire
    const record = (cx: number, cy: number, cellWinding: number | null, cellSize: number) => {
        if (zeros.length >= MAX_ZEROS) {
            truncated = true;
            return;
        }
        let z = newton2d(F, cx, cy, newtonTol);
        let presetIndex: number | null = null;
        // accept near-machine zeros too: at C⁰ kinks (e.g. a fixed point
        // pinned exactly on a clamped boundary) Newton stalls just above
        // the strict tolerance
        if (z.residual > 1e-7) {
            // Newton failed, but a nonzero cell winding CERTIFIES a zero in
            // this (maxDepth-small) cell — report the center at cell
            // accuracy rather than silently dropping a certified zero.
            // Typical case: a fixed point pinned on the clamped boundary,
            // whose kinked neighborhood defeats FD Newton.
            if (cellWinding === null || cellWinding === 0) return;
            const probe = evalScratch;
            F(cx, cy, probe);
            z = { x: cx, y: cy, residual: Math.hypot(probe.x, probe.y), converged: false };
            if (z.residual > 10 * cellSize) return; // winding artifact, not a zero
            presetIndex = cellWinding; // the certificate IS the index
        }
        // reject zeros Newton wandered to outside the search domain
        if (
            z.x < box.x0 - margin || z.x > box.x1 + margin ||
            z.y < box.y0 - margin || z.y > box.y1 + margin
        ) {
            return;
        }
        for (const existing of zeros) {
            if (Math.hypot(existing.x - z.x, existing.y - z.y) < dedupeTol) {
                if (z.residual < existing.residual) {
                    existing.x = z.x;
                    existing.y = z.y;
                    existing.residual = z.residual;
                }
                return;
            }
        }
        zeros.push({ x: z.x, y: z.y, residual: z.residual, index: presetIndex });
    };

    interface Cell extends Box {
        depth: number;
    }
    const stack: Cell[] = [{ ...box, depth: 0 }];
    let cellsProcessed = 0;
    let truncated = false;
    while (stack.length > 0) {
        if (++cellsProcessed > maxCells) {
            truncated = true;
            break;
        }
        const cell = stack.pop()!;
        const bw = boundaryWinding(F, cell, samplesPerEdge);
        const interesting = bw.winding === null || bw.winding !== 0;

        const split = interesting ? cell.depth < maxDepth : cell.depth < minDepth;
        if (split) {
            const mx = (cell.x0 + cell.x1) / 2;
            const my = (cell.y0 + cell.y1) / 2;
            const d = cell.depth + 1;
            stack.push(
                { x0: cell.x0, y0: cell.y0, x1: mx, y1: my, depth: d },
                { x0: mx, y0: cell.y0, x1: cell.x1, y1: my, depth: d },
                { x0: cell.x0, y0: my, x1: mx, y1: cell.y1, depth: d },
                { x0: mx, y0: my, x1: cell.x1, y1: cell.y1, depth: d },
            );
        } else if (interesting) {
            record(
                (cell.x0 + cell.x1) / 2,
                (cell.y0 + cell.y1) / 2,
                bw.winding,
                cell.x1 - cell.x0,
            );
        }
    }

    // indices, with radii kept clear of neighboring zeros (skip zeros whose
    // index is already certified by their cell winding)
    for (const zero of zeros) {
        if (zero.index !== null) continue;
        let nearest = Infinity;
        for (const other of zeros) {
            if (other === zero) continue;
            nearest = Math.min(nearest, Math.hypot(other.x - zero.x, other.y - zero.y));
        }
        zero.index = zeroIndex(F, zero.x, zero.y, Math.min(0.01, 0.25 * nearest));
    }
    let indexSum: number | null = 0;
    for (const zero of zeros) {
        if (zero.index === null) {
            indexSum = null;
            break;
        }
        indexSum += zero.index;
    }
    if (truncated) indexSum = null;
    return { zeros, indexSum, truncated };
}

/**
 * Local index of an (isolated) zero: winding of F around a small circle.
 * Retries a few radii; null when none gives a trustworthy winding
 * (typically a degenerate zero).
 */
export function zeroIndex(
    F: PlaneField,
    zx: number,
    zy: number,
    radius = 0.01,
): number | null {
    for (const rho of [radius, radius / 8, radius * 4]) {
        if (rho < 1e-7) continue;
        const w = windingOfLoop(
            (theta, out) => F(zx + rho * Math.cos(theta), zy + rho * Math.sin(theta), out),
            256,
            0,
        );
        if (w.winding !== null && w.minRadius > 0) return w.winding;
    }
    return null;
}

// ------------------------------------------------------------------ newton

interface NewtonResult {
    x: number;
    y: number;
    residual: number;
    converged: boolean;
}

/** Damped Newton for F(x, y) = 0 (same scheme as collisionFinder.refineZero,
 *  but on plane coordinates — no angle wrapping, no clamping). */
function newton2d(F: PlaneField, x0: number, y0: number, tol: number): NewtonResult {
    const Fv = evalScratch;
    const Fp = scratchB;
    const Fm = scratchC;

    let x = x0;
    let y = y0;
    F(x, y, Fv);
    let norm = Math.hypot(Fv.x, Fv.y);

    for (let iter = 0; iter < 60 && norm > tol; iter++) {
        const hx = 1e-6 * (1 + Math.abs(x));
        const hy = 1e-6 * (1 + Math.abs(y));
        F(x + hx, y, Fp);
        F(x - hx, y, Fm);
        const j11 = (Fp.x - Fm.x) / (2 * hx);
        const j21 = (Fp.y - Fm.y) / (2 * hx);
        F(x, y + hy, Fp);
        F(x, y - hy, Fm);
        const j12 = (Fp.x - Fm.x) / (2 * hy);
        const j22 = (Fp.y - Fm.y) / (2 * hy);

        const det = j11 * j22 - j12 * j21;
        if (!Number.isFinite(det) || Math.abs(det) < 1e-14) break;
        const dx = (-Fv.x * j22 + Fv.y * j12) / det;
        const dy = (-j11 * Fv.y + j21 * Fv.x) / det;

        let lambda = 1;
        let accepted = false;
        for (let k = 0; k < 8; k++) {
            F(x + lambda * dx, y + lambda * dy, Fp);
            const normNew = Math.hypot(Fp.x, Fp.y);
            if (normNew < norm) {
                x += lambda * dx;
                y += lambda * dy;
                Fv.x = Fp.x;
                Fv.y = Fp.y;
                norm = normNew;
                accepted = true;
                break;
            }
            lambda /= 2;
        }
        if (!accepted) break;
    }
    return { x, y, residual: norm, converged: norm <= tol };
}

const evalScratch = vec2();
const scratchB = vec2();
const scratchC = vec2();
