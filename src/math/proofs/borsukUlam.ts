/**
 * Borsuk–Ulam theorem (math spec §3).
 *
 * For f: S² → D², graph the latitude restriction and its antipodal
 * companion:
 *
 *     Γ_f(φ, θ)  = (θ, f(x(φ, θ))),
 *     Γ_f̄(φ, θ) = (θ, f(−x(φ, θ))) = (θ, f(x(π − φ, θ + π))).
 *
 * A Borsuk–Ulam pair f(x) = f(−x) is a same-θ collision of the two curves.
 * At the equator the companion is the half-turn shift f_eq(θ + π), and the
 * segment ribbon joining the curves carries an odd twist — reported here as
 * the relative winding meter.
 */

import type { LabeledLoop, Vec2, Vec3 } from "../types.ts";
import { vec2, vec3 } from "../types.ts";
import type { SphereDiskMap } from "../maps/sphereMaps.ts";
import { spherePoint } from "../maps/sphereMaps.ts";
import { labeled } from "./types.ts";
import {
    findWindingTransition,
    refineZero,
    refineZeroPattern,
} from "../analysis/collisionFinder.ts";
import type { DifferenceField, WindingTransition } from "../analysis/collisionFinder.ts";

/** Γ_f(φ): the graph of f restricted to the latitude φ. */
export function latitudeGraphLoop(
    f: SphereDiskMap,
    phi: number,
    time = 0,
): LabeledLoop {
    const x = vec3();
    return labeled(
        (theta, out) => {
            spherePoint(phi, theta, x);
            f.evalSphere(x, time, out);
        },
        "map",
        "f",
    );
}

/** Γ_f̄(φ): the antipodal companion, via −x(φ, θ) = x(π − φ, θ + π). */
export function antipodalGraphLoop(
    f: SphereDiskMap,
    phi: number,
    time = 0,
): LabeledLoop {
    const x = vec3();
    return labeled(
        (theta, out) => {
            spherePoint(Math.PI - phi, theta + Math.PI, x);
            f.evalSphere(x, time, out);
        },
        "antipodal-map",
        "f̄",
    );
}

// ---------------------------------------------------------------- finder

export interface AntipodalPairResult {
    /** true when the residual is at solver precision */
    found: boolean;
    /** the point x on the sphere with f(x) = f(−x); the pair is (x, −x) */
    x: Vec3;
    phi: number;
    theta: number;
    /** the shared disk value f(x) = f(−x) */
    value: Vec2;
    /** |f(x) − f(−x)| */
    residual: number;
    /** the twist transition that localized it (null for degenerate maps
     *  whose twist never changes, e.g. odd maps with pole pairs) */
    transition: WindingTransition | null;
}

/**
 * Find an antipodal pair f(x) = f(−x) the way the proof does
 * (collisionFinder.ts): bisect the latitude interval where the twist of
 * (Γ_f, Γ_f̄) jumps, then Newton-trace the collision
 * d(φ, θ) = f(x(φ,θ)) − f(x(π−φ, θ+π)) = 0 to machine precision.
 *
 * `residualTol` decides success AND triggers the derivative-free fallback:
 * piecewise-linear maps (plSphereMap) kink at creases where Newton stalls,
 * and their Float32 data bottoms out near 1e-7 anyway — sculpting demos
 * pass a looser tolerance (e.g. 1e-5) and the pattern search finishes the
 * job on continuity alone.
 */
export function findAntipodalPair(
    f: SphereDiskMap,
    options: { time?: number; residualTol?: number } = {},
): AntipodalPairResult {
    const time = options.time ?? 0;
    const residualTol = options.residualTol ?? 1e-8;
    const x = vec3();
    const xbar = vec3();
    const fx = vec2();
    const d: DifferenceField = (phi, theta, out) => {
        spherePoint(phi, theta, x);
        spherePoint(Math.PI - phi, theta + Math.PI, xbar);
        f.evalSphere(x, time, fx);
        f.evalSphere(xbar, time, out);
        out.x = fx.x - out.x;
        out.y = fx.y - out.y;
    };

    const sClamp: [number, number] = [1e-3, Math.PI / 2];
    const { transition, seed } = findWindingTransition(d, [0.02, Math.PI / 2]);
    let best = refineZero(d, seed, { sClamp });
    if (best.residual > residualTol) {
        // Newton stalled (C⁰ kink) — pattern-search from the better point
        const start = best.residual < seed.residual ? best : seed;
        const bracket = transition ? transition.bracket[1] - transition.bracket[0] : 0.01;
        const polished = refineZeroPattern(d, start, {
            sClamp,
            initialStep: { s: Math.max(bracket, 1e-4), theta: (2 * Math.PI) / 256 },
            tol: Math.min(residualTol, 1e-7),
        });
        if (polished.residual < best.residual) best = polished;
    }

    spherePoint(best.s, best.theta, x);
    f.evalSphere(x, time, fx);
    return {
        found: best.residual < residualTol,
        x: vec3(x.x, x.y, x.z),
        phi: best.s,
        theta: best.theta,
        value: vec2(fx.x, fx.y),
        residual: best.residual,
        transition,
    };
}
