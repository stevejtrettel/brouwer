/**
 * sphereGrid — a triangulated unit sphere and the two editable PL objects
 * built on it, mirroring diskGrid.ts conventions exactly:
 *
 *   - plSphereMap: a piecewise-linear map f: S² → D² whose state is the
 *     image position of every grid vertex (the sculptable "balloon" for
 *     Borsuk–Ulam);
 *   - plTangentField: a piecewise-linear tangent field whose state is a
 *     tangent vector at every grid vertex (the comb-able "hair" for
 *     Poincaré).
 *
 * The grid is lat-long: two pole vertices plus (bands − 1) rows of
 * `sectors` vertices, triangulated with pole fans and the disk grid's
 * two-triangle quad split. Every triangle is CCW SEEN FROM OUTSIDE
 * (outward normal) — which is what makes the flattened balloon render its
 * far hemisphere through the fold-tint material for free, exactly like the
 * disk grid's crumple (northern hemisphere flattens CCW, southern CW).
 *
 * Point location is O(1) from the lat-long structure; barycentric weights
 * use CENTRAL PROJECTION (Cramer on [A|B|C]·w = x), which is chart-free,
 * uniform at the poles, and exact at vertices.
 */

import type { Vec2, Vec3 } from "./types.ts";
import { vec2, vec3, length3 } from "./types.ts";
import type { SphereDiskMap } from "./maps/sphereMaps.ts";
import { equatorialProjection, spherePoint } from "./maps/sphereMaps.ts";
import type { TangentVectorField } from "./maps/tangentFields.ts";
import { projectedConstantField } from "./maps/tangentFields.ts";
import { tangentProject } from "./maps/project.ts";
import type { Neighborhoods } from "./diskGrid.ts";

/** Hard |v| ≤ 1 safety clamp — identity inside the ball. Vertex vectors are
 *  already soft-clamped when written (presets and brush edits), so applying
 *  the smooth profile again here would double-compress; interpolation and
 *  tangent projection only shrink, leaving just fallback-extrapolation
 *  overshoot to guard against. */
function hardClampLength(v: Vec3): Vec3 {
    const r = length3(v);
    if (r > 1) {
        v.x /= r;
        v.y /= r;
        v.z /= r;
    }
    return v;
}

export interface SphereGrid {
    /** vertex count */
    readonly V: number;
    /** triangle count */
    readonly T: number;
    /** 3V interleaved unit vectors (math z-up) — the sphere's own domain */
    readonly domain: Float32Array;
    /** 3T vertex indices, every triangle CCW seen from OUTSIDE */
    readonly indices: Uint32Array;
    /** lat-long structure (enables O(1) point location) */
    readonly bands: number;
    readonly sectors: number;
}

/**
 * North pole + (bands − 1) rows of `sectors` vertices + south pole.
 * Row k (1-based) sits at polar angle φ = kπ/bands; row k sector j is
 * vertex 1 + (k−1)·sectors + j — the disk grid's formula with φ playing
 * the role of radius.
 */
export function createSphereGrid(bands = 48, sectors = 96): SphereGrid {
    const V = 2 + (bands - 1) * sectors;
    const domain = new Float32Array(3 * V);
    const p = vec3();
    domain[2] = 1; // vertex 0: north pole (0, 0, 1)
    for (let k = 1; k < bands; k++) {
        const phi = (Math.PI * k) / bands;
        for (let j = 0; j < sectors; j++) {
            const i = 1 + (k - 1) * sectors + j;
            spherePoint(phi, (2 * Math.PI * j) / sectors, p);
            domain[3 * i] = p.x;
            domain[3 * i + 1] = p.y;
            domain[3 * i + 2] = p.z;
        }
    }
    domain[3 * (V - 1) + 2] = -1; // vertex V−1: south pole

    const T = 2 * sectors * (bands - 1);
    const indices = new Uint32Array(3 * T);
    let t = 0;
    // north fan (CCW from outside: pole, j, j+1)
    for (let j = 0; j < sectors; j++) {
        indices[t++] = 0;
        indices[t++] = 1 + j;
        indices[t++] = 1 + ((j + 1) % sectors);
    }
    // quads between consecutive rows, the disk grid's split with
    // "inner = smaller φ"
    for (let k = 1; k <= bands - 2; k++) {
        const upper = 1 + (k - 1) * sectors;
        const lower = 1 + k * sectors;
        for (let j = 0; j < sectors; j++) {
            const j1 = (j + 1) % sectors;
            indices[t++] = upper + j;
            indices[t++] = lower + j;
            indices[t++] = lower + j1;
            indices[t++] = upper + j;
            indices[t++] = lower + j1;
            indices[t++] = upper + j1;
        }
    }
    // south fan, reversed so it stays CCW from outside
    const last = 1 + (bands - 2) * sectors;
    for (let j = 0; j < sectors; j++) {
        indices[t++] = V - 1;
        indices[t++] = last + ((j + 1) % sectors);
        indices[t++] = last + j;
    }
    return { V, T, domain, indices, bands, sectors };
}

// ------------------------------------------------------- point location

/** The triangle containing a sphere point plus its barycentric weights. */
interface Located {
    a: number;
    b: number;
    c: number;
    la: number;
    lb: number;
    lc: number;
}

const TWO_PI = 2 * Math.PI;

/**
 * Central-projection barycentric weights in the triangle (a, b, c): solve
 * [A|B|C]·w = x by Cramer, normalize to Σλ = 1. Weights come from DOMAIN
 * vertices; the caller interpolates whatever per-vertex data it owns.
 * Non-commit rejects when x is outside the spherical triangle.
 */
function weightsInTriangle(
    domain: Float32Array,
    px: number,
    py: number,
    pz: number,
    a: number,
    b: number,
    c: number,
    out: Located,
    commit: boolean,
): boolean {
    const ax = domain[3 * a]!;
    const ay = domain[3 * a + 1]!;
    const az = domain[3 * a + 2]!;
    const bx = domain[3 * b]!;
    const by = domain[3 * b + 1]!;
    const bz = domain[3 * b + 2]!;
    const cx = domain[3 * c]!;
    const cy = domain[3 * c + 1]!;
    const cz = domain[3 * c + 2]!;
    // det(u, v, w) = u · (v × w)
    const wa = px * (by * cz - bz * cy) + py * (bz * cx - bx * cz) + pz * (bx * cy - by * cx);
    const wb = ax * (py * cz - pz * cy) + ay * (pz * cx - px * cz) + az * (px * cy - py * cx);
    const wc = ax * (by * pz - bz * py) + ay * (bz * px - bx * pz) + az * (bx * py - by * px);
    const sum = wa + wb + wc;
    const la = wa / sum;
    const lb = wb / sum;
    const lc = wc / sum;
    if (!commit && (la < -1e-9 || lb < -1e-9 || lc < -1e-9)) return false;
    out.a = a;
    out.b = b;
    out.c = c;
    out.la = la;
    out.lb = lb;
    out.lc = lc;
    return true;
}

/**
 * O(1) point location from the lat-long structure: band from φ, sector
 * from θ, then pole fan (commit) or the cell's two triangles (try/fallback)
 * — matching createSphereGrid's split exactly, like plDiskMap does for the
 * disk. (px, py, pz) must be unit.
 */
function locate(grid: SphereGrid, px: number, py: number, pz: number, out: Located): void {
    const { bands, sectors, domain, V } = grid;
    const phi = Math.acos(Math.max(-1, Math.min(1, pz)));
    const theta = ((Math.atan2(py, px) % TWO_PI) + TWO_PI) % TWO_PI;
    const j = Math.min(Math.floor((theta / TWO_PI) * sectors), sectors - 1);
    const j1 = (j + 1) % sectors;
    const k = Math.min(Math.floor((phi / Math.PI) * bands), bands - 1);
    if (k === 0) {
        weightsInTriangle(domain, px, py, pz, 0, 1 + j, 1 + j1, out, true);
        return;
    }
    if (k === bands - 1) {
        const last = 1 + (bands - 2) * sectors;
        weightsInTriangle(domain, px, py, pz, V - 1, last + j1, last + j, out, true);
        return;
    }
    const upper = 1 + (k - 1) * sectors;
    const lower = 1 + k * sectors;
    const A = upper + j;
    const B = lower + j;
    const C = lower + j1;
    const D = upper + j1;
    if (!weightsInTriangle(domain, px, py, pz, A, B, C, out, false)) {
        weightsInTriangle(domain, px, py, pz, A, C, D, out, true);
    }
}

// -------------------------------------------------------- PL sphere map

/**
 * A piecewise-linear map f: S² → D² defined by the grid itself: assign
 * each vertex an image position in the disk and interpolate. This is the
 * balloon-sculpting editor's native representation — dragging edits
 * `positions` directly, and since D² is convex, positions inside the disk
 * give a disk-valued map for free.
 */
export interface PLSphereMap extends SphereDiskMap {
    readonly grid: SphereGrid;
    /** 2V interleaved image coordinates in D² — mutate freely, then redraw */
    readonly positions: Float32Array;
    snapshot(): Float32Array;
    restore(snap: Float32Array): void;
    /** re-bake an analytic preset into the vertex positions */
    resetToPreset(f: SphereDiskMap, time?: number): void;
}

export function plSphereMap(
    grid: SphereGrid,
    preset: SphereDiskMap = equatorialProjection(),
    time = 0,
): PLSphereMap {
    const positions = new Float32Array(2 * grid.V);
    const loc: Located = { a: 0, b: 0, c: 0, la: 0, lb: 0, lc: 0 };

    const map: PLSphereMap = {
        id: "pl-sphere-map",
        name: "sculpted balloon",
        params: {},
        grid,
        positions,
        evalSphere: (x, _t, out) => {
            const len = Math.hypot(x.x, x.y, x.z) || 1;
            locate(grid, x.x / len, x.y / len, x.z / len, loc);
            out.x =
                loc.la * positions[2 * loc.a]! +
                loc.lb * positions[2 * loc.b]! +
                loc.lc * positions[2 * loc.c]!;
            out.y =
                loc.la * positions[2 * loc.a + 1]! +
                loc.lb * positions[2 * loc.b + 1]! +
                loc.lc * positions[2 * loc.c + 1]!;
            return out;
        },
        snapshot() {
            return new Float32Array(positions);
        },
        restore(snap) {
            positions.set(snap);
        },
        resetToPreset(f, t = 0) {
            pushforwardSphereInto(grid, f, t, positions);
        },
    };
    map.resetToPreset(preset, time);
    return map;
}

/**
 * Map every grid vertex through f, writing 2V interleaved image
 * coordinates into `out`. Allocation-free (module scratch — not reentrant).
 */
export function pushforwardSphereInto(
    grid: SphereGrid,
    f: SphereDiskMap,
    time: number,
    out: Float32Array,
): void {
    const p = pushScratch3;
    const q = pushScratch2;
    for (let i = 0; i < grid.V; i++) {
        p.x = grid.domain[3 * i]!;
        p.y = grid.domain[3 * i + 1]!;
        p.z = grid.domain[3 * i + 2]!;
        f.evalSphere(p, time, q);
        out[2 * i] = q.x;
        out[2 * i + 1] = q.y;
    }
}
const pushScratch3 = vec3();
const pushScratch2: Vec2 = vec2();

// ----------------------------------------------------- PL tangent field

/**
 * A piecewise-linear tangent field on S² defined by the grid: a tangent
 * vector at every vertex, interpolated barycentrically and re-projected
 * onto the tangent plane at the query point (so interpolated values honor
 * v(x) ⊥ x exactly). Length stays ≤ 1 because vertex vectors are written
 * soft-clamped and interpolation/projection only shrink; eval adds a hard
 * safety clamp. This is the comb's native representation.
 */
export interface PLTangentField extends TangentVectorField {
    readonly grid: SphereGrid;
    /** 3V interleaved tangent vectors, vᵢ ⊥ domainᵢ, |vᵢ| ≤ 1 */
    readonly vectors: Float32Array;
    snapshot(): Float32Array;
    restore(snap: Float32Array): void;
    /** re-bake an analytic preset into the vertex vectors */
    resetToPreset(v: TangentVectorField, time?: number): void;
}

export function plTangentField(
    grid: SphereGrid,
    preset: TangentVectorField = projectedConstantField(1, 0, 0),
    time = 0,
): PLTangentField {
    const vectors = new Float32Array(3 * grid.V);
    const loc: Located = { a: 0, b: 0, c: 0, la: 0, lb: 0, lc: 0 };
    const unit = vec3();

    const field: PLTangentField = {
        id: "pl-tangent-field",
        name: "combed field",
        params: {},
        grid,
        vectors,
        evalTangent: (x, _t, out) => {
            const len = Math.hypot(x.x, x.y, x.z) || 1;
            unit.x = x.x / len;
            unit.y = x.y / len;
            unit.z = x.z / len;
            locate(grid, unit.x, unit.y, unit.z, loc);
            out.x =
                loc.la * vectors[3 * loc.a]! +
                loc.lb * vectors[3 * loc.b]! +
                loc.lc * vectors[3 * loc.c]!;
            out.y =
                loc.la * vectors[3 * loc.a + 1]! +
                loc.lb * vectors[3 * loc.b + 1]! +
                loc.lc * vectors[3 * loc.c + 1]!;
            out.z =
                loc.la * vectors[3 * loc.a + 2]! +
                loc.lb * vectors[3 * loc.b + 2]! +
                loc.lc * vectors[3 * loc.c + 2]!;
            tangentProject(out, unit, out);
            return hardClampLength(out);
        },
        snapshot() {
            return new Float32Array(vectors);
        },
        restore(snap) {
            vectors.set(snap);
        },
        resetToPreset(v, t = 0) {
            const p = pushScratch3;
            const w = fieldScratch;
            for (let i = 0; i < grid.V; i++) {
                p.x = grid.domain[3 * i]!;
                p.y = grid.domain[3 * i + 1]!;
                p.z = grid.domain[3 * i + 2]!;
                v.evalTangent(p, t, w);
                vectors[3 * i] = w.x;
                vectors[3 * i + 1] = w.y;
                vectors[3 * i + 2] = w.z;
            }
        },
    };
    field.resetToPreset(preset, time);
    return field;
}
const fieldScratch = vec3();

/**
 * Vector-Laplacian ironing of a combed field: Jacobi passes relaxing each
 * vertex vector toward its neighborhood average, then re-projected tangent
 * (averaging never lengthens, so only the hard safety clamp applies) — the
 * comb's analogue of smoothDisplacements. `scratch` must be a Float32Array
 * of length 3V (caller-owned, allocation-free).
 */
export function smoothTangentVectors(
    grid: SphereGrid,
    hood: Neighborhoods,
    vectors: Float32Array,
    scratch: Float32Array,
    options: { lambda?: number; iterations?: number; pinWeights?: Float32Array | null } = {},
): void {
    const lambda = options.lambda ?? 0.4;
    const iterations = options.iterations ?? 2;
    const pins = options.pinWeights ?? null;
    const { V, domain } = grid;
    const v = smoothScratchV;
    const x = smoothScratchX;

    for (let iter = 0; iter < iterations; iter++) {
        for (let i = 0; i < V; i++) {
            const from = hood.start[i]!;
            const to = hood.start[i + 1]!;
            let ax = 0;
            let ay = 0;
            let az = 0;
            for (let k = from; k < to; k++) {
                const n = hood.list[k]!;
                ax += vectors[3 * n]!;
                ay += vectors[3 * n + 1]!;
                az += vectors[3 * n + 2]!;
            }
            const count = to - from;
            ax /= count;
            ay /= count;
            az /= count;
            const free = lambda * (pins ? 1 - pins[i]! : 1);
            scratch[3 * i] = vectors[3 * i]! + free * (ax - vectors[3 * i]!);
            scratch[3 * i + 1] = vectors[3 * i + 1]! + free * (ay - vectors[3 * i + 1]!);
            scratch[3 * i + 2] = vectors[3 * i + 2]! + free * (az - vectors[3 * i + 2]!);
        }
        // re-project tangent and clamp while copying back
        for (let i = 0; i < V; i++) {
            v.x = scratch[3 * i]!;
            v.y = scratch[3 * i + 1]!;
            v.z = scratch[3 * i + 2]!;
            x.x = domain[3 * i]!;
            x.y = domain[3 * i + 1]!;
            x.z = domain[3 * i + 2]!;
            tangentProject(v, x, v);
            hardClampLength(v);
            vectors[3 * i] = v.x;
            vectors[3 * i + 1] = v.y;
            vectors[3 * i + 2] = v.z;
        }
    }
}
const smoothScratchV = vec3();
const smoothScratchX = vec3();
