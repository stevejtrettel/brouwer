/**
 * Tangent vector fields on S² for the Poincaré / hairy-ball theorem
 * (math spec §5.3). Every field satisfies v(x) ⊥ x by construction and is
 * length-clamped to |v| ≤ 1 so tangent vectors convert directly into disk
 * coordinates.
 */

import type { Vec3 } from "../types.ts";
import { set3, vec3, cross3, length3, dot3, addScaled3 } from "../types.ts";

export interface TangentVectorField {
    id: string;
    name: string;
    params: Record<string, number>;
    /** v(x) ⊥ x, |v| ≤ 1, written into out. */
    evalTangent(x: Vec3, time: number, out: Vec3): Vec3;
}

/** Smoothly clamp |v| ≤ 1 in place (same profile as the disk clamp).
 *  Exported so PL fields (sphereGrid.ts) keep the identical profile. */
export function softClampLength(v: Vec3): Vec3 {
    const r = length3(v);
    if (r === 0) return v;
    const s = 1 / Math.pow(1 + Math.pow(r, 8), 1 / 8);
    return set3(v, v.x * s, v.y * s, v.z * s);
}
const clampLength = softClampLength;

/**
 * Projected constant field v(x) = a − ⟨a, x⟩x: the canonical hairy-ball
 * example, with exactly two zeros at ±a/|a|.
 */
export function projectedConstantField(
    ax = 1,
    ay = 0,
    az = 0,
): TangentVectorField {
    const params = { ax, ay, az };
    const a = vec3();
    return {
        id: "projected-constant",
        name: "projected constant",
        params,
        evalTangent: (x, _t, out) => {
            set3(a, params.ax, params.ay, params.az);
            addScaled3(out, a, x, -dot3(a, x));
            return clampLength(out);
        },
    };
}

/**
 * Rotational field v(x) = ω × x: flow of rotation about the axis ω, with
 * zeros at the two poles of the axis.
 */
export function rotationalField(wx = 0, wy = 0, wz = 1): TangentVectorField {
    const params = { wx, wy, wz };
    const w = vec3();
    return {
        id: "rotational",
        name: "rotational",
        params,
        evalTangent: (x, _t, out) => {
            set3(w, params.wx, params.wy, params.wz);
            cross3(out, w, x);
            return clampLength(out);
        },
    };
}
