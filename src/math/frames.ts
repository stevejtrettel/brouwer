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
import { set2, set3, copy3, vec3, cross3, normalize3, dot3, addScaled3 } from "./types.ts";
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

/**
 * The paper's "ace out of our sleeve": the unit-speed family deforming the
 * small north loop γ to its reverse γ̄ (§4). One parameter s ∈ [0, 1]:
 *
 *   leg 1 (s ≤ ½)  c = N fixed, angular radius α₀ → π − α₀: γ stretches
 *                  through the Tropic of Cancer, the equator, the Tropic
 *                  of Capricorn, to a small loop around the south pole
 *                  (a circle centered at N with radius π − α₀ IS that loop);
 *   leg 2 (s ≥ ½)  radius π − α₀ fixed, the center rides the x–z meridian
 *                  from N to S — equivalently the small loop climbs the
 *                  far meridian and over the north pole, home again.
 *
 * At s = 1 the circle centered at S with radius π − α₀ is the original
 * latitude circle traversed BACKWARDS: γ₁(θ) = γ₀(π − θ). The transport
 * frame w = ŷ is constant and never parallel to the center, so the family
 * is continuous (and each loop constant-speed, hence unit-speed after the
 * frame's normalization).
 */
export interface SmallCircle {
    loop: SphereLoop;
    /** circle center on S² (math z-up) — for domain-view display */
    center: Vec3;
    /** angular radius ∈ (0, π) */
    alpha: number;
}

export function overPoleFamily(s: number, alpha0: number): SmallCircle {
    const t = Math.min(1, Math.max(0, s));
    const center = vec3();
    let alpha: number;
    if (t <= 0.5) {
        set3(center, 0, 0, 1);
        alpha = alpha0 + 2 * t * (Math.PI - 2 * alpha0);
    } else {
        const psi = (2 * t - 1) * Math.PI;
        set3(center, Math.sin(psi), 0, Math.cos(psi));
        alpha = Math.PI - alpha0;
    }
    return { loop: smallCircleLoop(center, alpha), center, alpha };
}

/**
 * The circle of angular radius α about `center`, with the fixed transport
 * frame w = ŷ, u = w × c (valid while the center avoids ±ŷ — the over-the-
 * pole path lives in the x–z plane, so always). With c = N this is exactly
 * latitudeLoop(α).
 */
export function smallCircleLoop(center: Vec3, alpha: number): SphereLoop {
    const c = vec3();
    copy3(c, center);
    normalize3(c, c);
    // u = ŷ × c, renormalized; w completes the frame in the circle's plane
    const u = vec3(c.z, 0, -c.x);
    normalize3(u, u);
    const w = vec3();
    cross3(w, c, u); // = ŷ when c ⊥ ŷ… keep exact orthonormality instead
    const cosA = Math.cos(alpha);
    const sinA = Math.sin(alpha);
    return {
        evalLoop: (theta, out) => {
            const cu = Math.cos(theta) * sinA;
            const cw = Math.sin(theta) * sinA;
            return set3(
                out,
                cosA * c.x + cu * u.x + cw * w.x,
                cosA * c.y + cu * u.y + cw * w.y,
                cosA * c.z + cu * u.z + cw * w.z,
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
