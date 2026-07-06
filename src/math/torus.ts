/**
 * The solid torus S¹ × D² and its embedding into ℝ³.
 *
 * Abstract coordinates: (θ, p) with p = (u, v), u² + v² ≤ 1.
 * The paper's embedding is z-up:
 *
 *     E(θ, u, v) = ((R + a·u) cos θ, (R + a·u) sin θ, a·v)
 *
 * three.js is y-up, so embed() applies the fixed mapping
 * (x, y, z)_math → (x, z, −y)_three, laying the torus in the horizontal
 * plane. This is the ONLY place mathematical coordinates become rendering
 * coordinates; every orientation convention downstream inherits from here.
 *
 * Core curve:        θ ↦ E(θ, 0, 0)
 * Meridional disk:   {θ} × D², spanned by the frame (e_u, e_v) at θ.
 */

import type { Vec3 } from "./types.ts";
import { set3 } from "./types.ts";
import { Params } from "../core/Params.ts";

export const TORUS_MAJOR_RADIUS = 2.0;
export const TORUS_MINOR_RADIUS = 0.65;

export class SolidTorus {
    readonly params = new Params(this);
    declare R: number; // major radius (distance of core from axis)
    declare a: number; // minor radius (radius of the meridional disk)

    constructor(options: { R?: number; a?: number } = {}) {
        this.params
            .define("R", options.R ?? TORUS_MAJOR_RADIUS, { triggers: "rebuild" })
            .define("a", options.a ?? TORUS_MINOR_RADIUS, { triggers: "rebuild" });
    }

    /** Embed intrinsic (θ, u, v) into three.js y-up world coordinates. */
    embed(theta: number, u: number, v: number, out: Vec3): Vec3 {
        const rho = this.R + this.a * u;
        return set3(out, rho * Math.cos(theta), this.a * v, -rho * Math.sin(theta));
    }

    /** Center of the meridional disk at θ (a point on the core curve). */
    coreAt(theta: number, out: Vec3): Vec3 {
        return this.embed(theta, 0, 0, out);
    }

    /**
     * Orthonormal frame of the meridional disk at θ, in world coordinates:
     * e_u points radially outward within the disk, e_v is vertical.
     * A disk point p = (u, v) embeds as coreAt(θ) + a·(u·e_u + v·e_v).
     */
    frameAt(theta: number, outEu: Vec3, outEv: Vec3): void {
        set3(outEu, Math.cos(theta), 0, -Math.sin(theta));
        set3(outEv, 0, 1, 0);
    }

    /** Unit tangent of the core curve at θ (direction of increasing θ). */
    coreTangentAt(theta: number, out: Vec3): Vec3 {
        return set3(out, -Math.sin(theta), 0, -Math.cos(theta));
    }
}
