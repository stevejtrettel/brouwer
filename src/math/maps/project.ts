/**
 * Projections keeping values inside the disk D² and tangent to S².
 *
 * Interactive maps must stay disk-valued; the hard projection y ↦ y/|y| for
 * |y| > 1 is continuous but kinks at the boundary, so generators default to
 * the soft radial clamp
 *
 *     s(r) = r / (1 + r⁸)^{1/8},
 *
 * which is smooth, ≈ identity for r ≲ 0.8, and → 1 as r → ∞. It never
 * quite reaches the boundary (s(1) ≈ 0.917) — acceptable for these
 * visualizations, where interior behavior is what matters.
 */

import type { Vec2, Vec3 } from "../types.ts";
import { set2, length2, dot3, addScaled3 } from "../types.ts";

/** Hard projection onto D²: identity inside, radial projection outside. */
export function projectToDisk(out: Vec2, p: Vec2): Vec2 {
    const r = length2(p);
    if (r <= 1) return set2(out, p.x, p.y);
    return set2(out, p.x / r, p.y / r);
}

/** Smooth radial clamp into the open disk (see header). */
export function softClampToDisk(out: Vec2, p: Vec2): Vec2 {
    const r = length2(p);
    if (r === 0) return set2(out, 0, 0);
    const s = 1 / Math.pow(1 + Math.pow(r, 8), 1 / 8);
    return set2(out, p.x * s, p.y * s);
}

/** Project an ambient vector w onto the tangent plane of S² at unit x:
 *  w ↦ w − ⟨w, x⟩x. */
export function tangentProject(out: Vec3, x: Vec3, w: Vec3): Vec3 {
    return addScaled3(out, w, x, -dot3(w, x));
}
