/**
 * Disk maps f: D² → D² for the Brouwer theorem (math spec §5.1).
 *
 * Maps are evaluated allocation-free and must remain continuous and
 * disk-valued; generators that could escape the disk route through the soft
 * radial clamp. `params` holds the user-tunable numbers so a GUI can bind to
 * them directly; evaluation reads them live.
 */

import type { Vec2 } from "../types.ts";
import { set2, vec2 } from "../types.ts";
import { softClampToDisk } from "./project.ts";

export interface DiskMap {
    id: string;
    name: string;
    params: Record<string, number>;
    /** f(x) written into out. `time` supports animated maps (unused so far). */
    evalDisk(x: Vec2, time: number, out: Vec2): Vec2;
}

/** The identity map i(x) = x — always the reference curve. */
export function identityMap(): DiskMap {
    return {
        id: "identity",
        name: "identity",
        params: {},
        evalDisk: (x, _t, out) => set2(out, x.x, x.y),
    };
}

/** Radial contraction f(x) = a·x. Unique fixed point at 0 for a < 1. */
export function radialContraction(a = 0.5): DiskMap {
    const params = { a };
    return {
        id: "radial-contraction",
        name: "radial contraction",
        params,
        evalDisk: (x, _t, out) => set2(out, params.a * x.x, params.a * x.y),
    };
}

/**
 * Contract toward a displaced center: f(x) = a·x + c, soft-clamped.
 * The canonical storyline example — f(0) = c ≠ 0, so for small r the two
 * graph curves are visibly unlinked parallel loops.
 */
export function displacedContraction(a = 0.55, cx = 0.3, cy = 0.15): DiskMap {
    const params = { a, cx, cy };
    const tmp = vec2();
    return {
        id: "displaced-contraction",
        name: "contract + displace",
        params,
        evalDisk: (x, _t, out) => {
            set2(tmp, params.a * x.x + params.cx, params.a * x.y + params.cy);
            return softClampToDisk(out, tmp);
        },
    };
}

/**
 * Twist-and-contract: in polar coordinates (r, φ) ↦ (a·r, φ + τ·(1 − r)),
 * then displace and clamp. Twist is strongest at the center, zero at the
 * boundary, so the graph curve winds decoratively without breaking
 * continuity.
 */
export function swirlMap(a = 0.75, tau = 2.5, cx = 0.25, cy = 0.0): DiskMap {
    const params = { a, tau, cx, cy };
    const tmp = vec2();
    return {
        id: "swirl",
        name: "swirl",
        params,
        evalDisk: (x, _t, out) => {
            const r = Math.hypot(x.x, x.y);
            const phi = Math.atan2(x.y, x.x) + params.tau * (1 - r);
            set2(
                tmp,
                params.a * r * Math.cos(phi) + params.cx,
                params.a * r * Math.sin(phi) + params.cy,
            );
            return softClampToDisk(out, tmp);
        },
    };
}
