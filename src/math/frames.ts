/**
 * Loops on S² and the moving tangent frame (math spec §4.1).
 *
 * Given a loop γ: S¹ → S², the frame along it is
 *
 *     e₁(θ) = γ'(θ)/|γ'(θ)|,       e₂(θ) = e₁(θ) × γ(θ),
 *
 * and a tangent field converts into fiber-disk coordinates by
 *
 *     p_γ(θ) = (⟨v(γ(θ)), e₁⟩, ⟨v(γ(θ)), e₂⟩).
 *
 * ORIENTATION CONVENTION: the paper writes e₂ = γ × e₁; we use the opposite
 * sign, e₂ = e₁ × γ, chosen so that the default eastward loop around the
 * north pole gives the graph curve winding +1 — a (1,1)-curve — matching
 * the paper's narrative (spec §4.2). This choice is pinned by a unit test;
 * flipping it flips every winding sign in the Poincaré scenes.
 */

import type { Vec3, DiskLoop } from "./types.ts";
import { set2, set3, vec3, cross3, normalize3, dot3, addScaled3 } from "./types.ts";
import type { TangentVectorField } from "./maps/tangentFields.ts";

export interface SphereLoop {
    /** γ(θ) ∈ S², written into out. θ ∈ [0, 2π). */
    evalLoop(theta: number, out: Vec3): Vec3;
}

/**
 * The latitude circle at polar angle φ, traversed eastward (θ increasing
 * counterclockwise seen from the north pole); `reversed` traverses it the
 * other way, γ̄(θ) = γ(−θ).
 */
export function latitudeLoop(phi: number, reversed = false): SphereLoop {
    const sign = reversed ? -1 : 1;
    return {
        evalLoop: (theta, out) => {
            const s = Math.sin(phi);
            return set3(
                out,
                s * Math.cos(sign * theta),
                s * Math.sin(sign * theta),
                Math.cos(phi),
            );
        },
    };
}

const FD_STEP = 1e-4;

/**
 * Moving frame at γ(θ): e₁ = unit tangent (central finite difference,
 * projected back onto the tangent plane), e₂ = e₁ × γ. Writes position and
 * both frame vectors; allocation-free.
 */
export function movingFrameAt(
    loop: SphereLoop,
    theta: number,
    outPos: Vec3,
    outE1: Vec3,
    outE2: Vec3,
): void {
    loop.evalLoop(theta, outPos);
    normalize3(outPos, outPos); // guard: keep γ exactly on the sphere

    loop.evalLoop(theta + FD_STEP, fwd);
    loop.evalLoop(theta - FD_STEP, bwd);
    set3(outE1, fwd.x - bwd.x, fwd.y - bwd.y, fwd.z - bwd.z);
    // project the tangent onto T_γ S² before normalizing — finite
    // differences of a curved path pick up a small radial component
    addScaled3(outE1, outE1, outPos, -dot3(outE1, outPos));
    normalize3(outE1, outE1);

    cross3(outE2, outE1, outPos); // see header for the sign convention
}
const fwd = vec3();
const bwd = vec3();

/**
 * The disk-valued loop p_γ(θ) of a tangent field along a sphere loop —
 * this is what gets graphed in the solid torus for Poincaré.
 */
export function tangentGraphLoop(
    field: TangentVectorField,
    loop: SphereLoop,
    time = 0,
): DiskLoop {
    const pos = vec3();
    const e1 = vec3();
    const e2 = vec3();
    const v = vec3();
    return (theta, out) => {
        movingFrameAt(loop, theta, pos, e1, e2);
        field.evalTangent(pos, time, v);
        set2(out, dot3(v, e1), dot3(v, e2));
    };
}
