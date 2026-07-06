/**
 * Angle unwrapping: given a sequence of angles (each only defined mod 2π),
 * choose representatives so consecutive differences lie in (−π, π]. This is
 * what makes numerical winding numbers well-defined for loops that stay away
 * from the origin.
 */

const TWO_PI = 2 * Math.PI;

/** Wrap a single angle difference into (−π, π]. */
export function wrapToPi(angle: number): number {
    let a = angle % TWO_PI;
    if (a > Math.PI) a -= TWO_PI;
    else if (a <= -Math.PI) a += TWO_PI;
    return a;
}

/** Unwrap an angle sequence into a continuous one (new array). */
export function unwrapAngles(angles: ArrayLike<number>): Float64Array {
    const out = new Float64Array(angles.length);
    if (angles.length === 0) return out;
    out[0] = angles[0]!;
    for (let i = 1; i < angles.length; i++) {
        out[i] = out[i - 1]! + wrapToPi(angles[i]! - angles[i - 1]!);
    }
    return out;
}
