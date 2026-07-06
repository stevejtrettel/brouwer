/**
 * Core math types. This layer knows NOTHING about three.js:
 * curves live intrinsically as (θ, u, v) ∈ S¹ × D², and only the
 * SolidTorus embedding converts them to ℝ³ for display.
 *
 * Vectors are plain mutable objects; operations are free functions written
 * allocation-free (caller supplies `out`) so per-frame resampling never
 * touches the garbage collector.
 */

export interface Vec2 {
    x: number;
    y: number;
}

export interface Vec3 {
    x: number;
    y: number;
    z: number;
}

export const vec2 = (x = 0, y = 0): Vec2 => ({ x, y });
export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

// ---- Vec2 ops ----

export function set2(out: Vec2, x: number, y: number): Vec2 {
    out.x = x;
    out.y = y;
    return out;
}

export function copy2(out: Vec2, a: Vec2): Vec2 {
    return set2(out, a.x, a.y);
}

export function length2(a: Vec2): number {
    return Math.hypot(a.x, a.y);
}

// ---- Vec3 ops ----

export function set3(out: Vec3, x: number, y: number, z: number): Vec3 {
    out.x = x;
    out.y = y;
    out.z = z;
    return out;
}

export function copy3(out: Vec3, a: Vec3): Vec3 {
    return set3(out, a.x, a.y, a.z);
}

export function dot3(a: Vec3, b: Vec3): number {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross3(out: Vec3, a: Vec3, b: Vec3): Vec3 {
    // careful: out may alias a or b, so compute first
    const x = a.y * b.z - a.z * b.y;
    const y = a.z * b.x - a.x * b.z;
    const z = a.x * b.y - a.y * b.x;
    return set3(out, x, y, z);
}

export function length3(a: Vec3): number {
    return Math.hypot(a.x, a.y, a.z);
}

export function normalize3(out: Vec3, a: Vec3): Vec3 {
    const len = length3(a);
    if (len === 0) return set3(out, 0, 0, 0);
    return set3(out, a.x / len, a.y / len, a.z / len);
}

export function addScaled3(out: Vec3, a: Vec3, b: Vec3, s: number): Vec3 {
    return set3(out, a.x + s * b.x, a.y + s * b.y, a.z + s * b.z);
}

// ---- Curves in the solid torus ----

/**
 * A disk-valued loop θ ↦ p(θ) ∈ D² — one slice of a proof.
 * Always written allocation-free: the implementation fills `out`.
 */
export type DiskLoop = (theta: number, out: Vec2) => void;

export type CurveRole =
    | "identity"
    | "map"
    | "antipodal-map"
    | "core"
    | "vector-field";

/**
 * A sampled graph curve Γ(θ) = (θ, p(θ)) in S¹ × D².
 *
 * Struct-of-arrays with N fixed at construction; refills mutate in place so
 * the render layer can update GPU buffers without reallocation. Samples are
 * uniform, θᵢ = 2πi/N, and the curve is closed (no duplicated endpoint —
 * consumers wrap indices mod N).
 */
export interface GraphCurve {
    readonly N: number;
    /** N samples of θ */
    readonly theta: Float32Array;
    /** 2N interleaved (u, v) disk coordinates */
    readonly disk: Float32Array;
    role: CurveRole;
    label: string;
}

/** A loop tagged with its role in a proof, before sampling. */
export interface LabeledLoop {
    loop: DiskLoop;
    role: CurveRole;
    label: string;
}
