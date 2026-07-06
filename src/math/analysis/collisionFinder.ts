/**
 * collisionFinder — locate a forced collision in a 1-parameter family of
 * disk-valued loops, the way the proofs do: topology first, analysis second.
 *
 * Setting: a difference field d(s, θ) ∈ ℝ², smooth in both variables, whose
 * zeros are the events we want (Brouwer: d = f_r − i_r and a zero is a fixed
 * point; Borsuk: d = f_φ − f̄_φ; Poincaré: d = p_γ itself). For each s the
 * loop θ ↦ d(s, θ) has a winding number around 0 — the linking number of the
 * underlying graph curves (see linking.ts).
 *
 * Stage 1 — TOPOLOGICAL BRACKETING. The winding is an integer and cannot
 * change while d stays nonzero, so any jump between two values of s
 * PROVABLY brackets a zero. Coarse-scan the range, then bisect the jump.
 * Two fallbacks keep the tool total:
 *   - winding undefined at some s (loop passes through ≈0): that s is
 *     already a collision — seed there;
 *   - no jump anywhere (e.g. a map whose only fixed point is at the center,
 *     where the family degenerates rather than transitions): seed from the
 *     global minimum of |d| seen during the scan.
 *
 * Stage 2 — ANALYTIC TRACING. From the seed, run damped Newton on the
 * square 2D root problem d(s, θ) = 0 with a central-difference Jacobian:
 * quadratic convergence to machine precision, step-halving when a step
 * doesn't decrease |d|, and s clamped to its admissible interval.
 *
 * The two stages are deliberately independent exports: the transition alone
 * is interesting (it's the moment the linking changes), and refineZero can
 * polish any seed, however obtained.
 */

import type { Vec2 } from "../types.ts";
import { vec2 } from "../types.ts";
import { wrapToPi } from "./unwrap.ts";

/** d(s, θ) written into out — zeros of d are the collisions sought. */
export type DifferenceField = (s: number, theta: number, out: Vec2) => void;

// ---------------------------------------------------------------- stage 1

export interface LoopWinding {
    /** integer winding, or null when the loop passes ≈0 or is undersampled */
    winding: number | null;
    /** min |d| over the sampled loop, and where it happens */
    minRadius: number;
    thetaAtMin: number;
}

/** Winding of a single loop θ ↦ d(θ) around 0, with the reliability guards
 *  of linking.ts (null when |d| dips below `minRadius` or the total is not
 *  near an integer). */
export function windingOfLoop(
    loop: (theta: number, out: Vec2) => void,
    N = 256,
    minRadius = 1e-3,
): LoopWinding {
    const p = scratch;
    let total = 0;
    let prev = 0;
    let rMin = Infinity;
    let thetaAtMin = 0;
    for (let i = 0; i <= N; i++) {
        const theta = (2 * Math.PI * (i % N)) / N;
        loop(theta, p);
        const r = Math.hypot(p.x, p.y);
        if (r < rMin) {
            rMin = r;
            thetaAtMin = theta;
        }
        const angle = Math.atan2(p.y, p.x);
        if (i > 0) total += wrapToPi(angle - prev);
        prev = angle;
    }
    const raw = total / (2 * Math.PI);
    const rounded = Math.round(raw);
    const reliable = rMin >= minRadius && Math.abs(raw - rounded) <= 0.05;
    return { winding: reliable ? rounded : null, minRadius: rMin, thetaAtMin };
}

export interface WindingTransition {
    /** s-interval across which the winding jumps (or collapses to touching) */
    bracket: [number, number];
    windingBelow: number | null;
    windingAbove: number | null;
}

export interface CollisionSeed {
    s: number;
    theta: number;
    /** |d| at the seed */
    residual: number;
}

export interface TransitionSearch {
    transition: WindingTransition | null;
    seed: CollisionSeed;
}

export interface TransitionOptions {
    /** θ samples per winding evaluation */
    N?: number;
    /** coarse-scan subdivisions of the s-range */
    coarseSteps?: number;
    /** stop bisecting when the bracket is this small */
    sTol?: number;
    /**
     * |d| guard for winding evaluations DURING the search. Defaults to 0:
     * near the transition the loop passes close to 0 by construction, and a
     * winding that stays integral still bisects correctly (it just decides
     * which side of the touching point the samples landed on). The
     * integrality check alone rejects genuinely unreliable evaluations.
     */
    minRadius?: number;
}

/**
 * Stage 1: find where the winding jumps, bisect it, and return the best
 * collision seed encountered. Always returns a seed (see header for the
 * no-transition fallbacks); `transition` is null only when the winding never
 * changes over the whole range.
 *
 * Accuracy: the bracket localizes where the SAMPLED loop's winding flips,
 * which sits within O(δθ²) of the true transition (δθ = 2π/N) — the
 * θ-discretized polygon touches 0 slightly later than the continuous loop.
 * Localization is this stage's whole job; machine precision is stage 2's.
 */
export function findWindingTransition(
    d: DifferenceField,
    range: [number, number],
    options: TransitionOptions = {},
): TransitionSearch {
    const N = options.N ?? 256;
    const steps = options.coarseSteps ?? 24;
    const sTol = options.sTol ?? 1e-6 * (range[1] - range[0]);
    const minRadius = options.minRadius ?? 0;

    const best: CollisionSeed = { s: range[0], theta: 0, residual: Infinity };
    const probe = (s: number): LoopWinding => {
        const w = windingOfLoop((theta, out) => d(s, theta, out), N, minRadius);
        if (w.minRadius < best.residual) {
            best.s = s;
            best.theta = w.thetaAtMin;
            best.residual = w.minRadius;
        }
        return w;
    };

    // coarse scan for a winding jump (or an already-touching s)
    let bracket: [number, number] | null = null;
    let wLow: number | null = null;
    let wHigh: number | null = null;
    let prevS = range[0];
    let prevW = probe(prevS).winding;
    for (let i = 1; i <= steps; i++) {
        const s = range[0] + ((range[1] - range[0]) * i) / steps;
        const w = probe(s).winding;
        if (w === null || prevW === null || w !== prevW) {
            bracket = [prevS, s];
            wLow = prevW;
            wHigh = w;
            break;
        }
        prevS = s;
        prevW = w;
    }
    if (bracket === null) return { transition: null, seed: best };

    // bisect the jump; a null winding means the curves already touch there,
    // which is exactly the collision — stop and let stage 2 polish it
    while (bracket[1] - bracket[0] > sTol) {
        const mid = (bracket[0] + bracket[1]) / 2;
        const w = probe(mid).winding;
        if (w === null) break;
        if (w === wLow) bracket[0] = mid;
        else {
            bracket[1] = mid;
            wHigh = w;
        }
    }

    return {
        transition: { bracket, windingBelow: wLow, windingAbove: wHigh },
        seed: best,
    };
}

// ---------------------------------------------------------------- stage 2

export interface RefineOptions {
    /** clamp s to this interval (defaults to unclamped) */
    sClamp?: [number, number];
    tol?: number;
    maxIterations?: number;
}

export interface CollisionResult {
    converged: boolean;
    s: number;
    /** wrapped into [0, 2π) */
    theta: number;
    /** |d(s, θ)| at the result */
    residual: number;
    iterations: number;
}

/**
 * Stage 2: damped Newton for d(s, θ) = 0 from a seed. Central-difference
 * Jacobian, step-halving line search, s clamped to sClamp.
 */
export function refineZero(
    d: DifferenceField,
    seed: { s: number; theta: number },
    options: RefineOptions = {},
): CollisionResult {
    const tol = options.tol ?? 1e-11;
    const maxIterations = options.maxIterations ?? 60;
    const [sLo, sHi] = options.sClamp ?? [-Infinity, Infinity];
    const clampS = (s: number) => Math.min(sHi, Math.max(sLo, s));

    const F = scratch;
    const Fp = scratchB;
    const Fm = scratchC;

    let s = clampS(seed.s);
    let theta = seed.theta;
    d(s, theta, F);
    let norm = Math.hypot(F.x, F.y);

    let iterations = 0;
    while (norm > tol && iterations < maxIterations) {
        iterations++;

        // central-difference Jacobian; steps scale with the current point
        const hs = 1e-6 * (1 + Math.abs(s));
        const ht = 1e-6;
        d(clampS(s + hs), theta, Fp);
        d(clampS(s - hs), theta, Fm);
        const dS = clampS(s + hs) - clampS(s - hs); // honest denominator at a clamp
        const j11 = (Fp.x - Fm.x) / dS;
        const j21 = (Fp.y - Fm.y) / dS;
        d(s, theta + ht, Fp);
        d(s, theta - ht, Fm);
        const j12 = (Fp.x - Fm.x) / (2 * ht);
        const j22 = (Fp.y - Fm.y) / (2 * ht);

        const det = j11 * j22 - j12 * j21;
        if (!Number.isFinite(det) || Math.abs(det) < 1e-14) break;

        // Newton step J·Δ = −F
        let ds = (-F.x * j22 + F.y * j12) / det;
        let dtheta = (-j11 * F.y + j21 * F.x) / det;

        // step-halving: insist each step decreases |d|
        let lambda = 1;
        let accepted = false;
        for (let k = 0; k < 8; k++) {
            const sNew = clampS(s + lambda * ds);
            const thetaNew = theta + lambda * dtheta;
            d(sNew, thetaNew, Fp);
            const normNew = Math.hypot(Fp.x, Fp.y);
            if (normNew < norm) {
                s = sNew;
                theta = thetaNew;
                F.x = Fp.x;
                F.y = Fp.y;
                norm = normNew;
                accepted = true;
                break;
            }
            lambda /= 2;
        }
        if (!accepted) break; // stuck (singular geometry, e.g. a whole circle of zeros)
    }

    theta = ((theta % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    return { converged: norm <= tol, s, theta, residual: norm, iterations };
}

// ------------------------------------------------------------ orchestrator

export interface FindCollisionOptions extends TransitionOptions, RefineOptions {}

export interface CollisionSearchResult extends CollisionResult {
    /** the linking transition that localized it, when one exists */
    transition: WindingTransition | null;
}

/**
 * The full tool: bracket the winding transition, then trace the collision.
 * `converged: false` with a small residual usually means a degenerate zero
 * set (e.g. the identity map, where every point is fixed).
 */
export function findCollision(
    d: DifferenceField,
    range: [number, number],
    options: FindCollisionOptions = {},
): CollisionSearchResult {
    const { transition, seed } = findWindingTransition(d, range, options);
    const refined = refineZero(d, seed, { sClamp: range, ...options });
    return { ...refined, transition };
}

const scratch = vec2();
const scratchB = vec2();
const scratchC = vec2();
