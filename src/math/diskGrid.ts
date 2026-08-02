/**
 * diskGrid — a triangulated unit disk and its pushforward through a map.
 *
 * The domain D² is triangulated ONCE (a center vertex plus concentric
 * rings); visualizing f: D² → D² is then just mapping every vertex through
 * f and drawing the image mesh with the DOMAIN's texture coordinates — the
 * "crumpled domain", with self-overlap appearing naturally as overlapping
 * triangles. The same structure will later let a user SPECIFY a map by
 * dragging the image mesh around: any assignment of image positions to
 * grid vertices is a piecewise-linear disk map.
 *
 * The discrete Jacobian needs no finite differences: the grid is built with
 * every domain triangle positively oriented (CCW), so a triangle is
 * orientation-REVERSED under f exactly when its image's signed area is
 * negative. orientationCounts() is the resulting fold census. (Render-side
 * this is also free: reversed triangles have CW winding, so a FrontSide/
 * BackSide material pair colors folds automatically.)
 */

import type { Vec2 } from "./types.ts";
import { vec2 } from "./types.ts";
import type { DiskMap } from "./maps/diskMaps.ts";

export interface DiskGrid {
    /** vertex count */
    readonly V: number;
    /** triangle count */
    readonly T: number;
    /** 2V interleaved (u, v) domain coordinates, |p| ≤ 1 */
    readonly domain: Float32Array;
    /** 3T vertex indices, every triangle CCW in the domain */
    readonly indices: Uint32Array;
    /** polar structure (enables O(1) point location) */
    readonly rings: number;
    readonly sectors: number;
}

/**
 * Center vertex + `rings` concentric rings of `sectors` vertices each.
 * Ring k sits at radius k/rings; the outermost ring lies on ∂D².
 */
export function createDiskGrid(rings = 40, sectors = 80): DiskGrid {
    const V = 1 + rings * sectors;
    const domain = new Float32Array(2 * V);
    // vertex 0 is the center; ring k (1-based), sector j is 1 + (k-1)*sectors + j
    for (let k = 1; k <= rings; k++) {
        const r = k / rings;
        for (let j = 0; j < sectors; j++) {
            const angle = (2 * Math.PI * j) / sectors;
            const i = 1 + (k - 1) * sectors + j;
            domain[2 * i] = r * Math.cos(angle);
            domain[2 * i + 1] = r * Math.sin(angle);
        }
    }

    const T = sectors + 2 * sectors * (rings - 1);
    const indices = new Uint32Array(3 * T);
    let t = 0;
    // inner fan around the center (CCW: center, j, j+1)
    for (let j = 0; j < sectors; j++) {
        indices[t++] = 0;
        indices[t++] = 1 + j;
        indices[t++] = 1 + ((j + 1) % sectors);
    }
    // quads between consecutive rings, split CCW
    for (let k = 1; k < rings; k++) {
        const inner = 1 + (k - 1) * sectors;
        const outer = 1 + k * sectors;
        for (let j = 0; j < sectors; j++) {
            const j1 = (j + 1) % sectors;
            indices[t++] = inner + j;
            indices[t++] = outer + j;
            indices[t++] = outer + j1;
            indices[t++] = inner + j;
            indices[t++] = outer + j1;
            indices[t++] = inner + j1;
        }
    }
    return { V, T, domain, indices, rings, sectors };
}

// ------------------------------------------------------ sheet structure
// The sculpting helpers below never need the full DiskGrid — only these
// structural slices — so any triangulated sheet with 2D positions (e.g. the
// flattened sphere image in sphereGrid.ts) can reuse them.

/** Any triangulated sheet: vertex count + triangle soup. */
export interface SheetTopology {
    readonly V: number;
    readonly T: number;
    readonly indices: Uint32Array;
}

/** A sheet plus its 2-interleaved rest positions (the relaxed shape). */
export interface SheetGeometry extends SheetTopology {
    readonly domain: Float32Array;
}

// ---------------------------------------------------------------- springs

export interface SpringEdges {
    /** 2E interleaved vertex index pairs */
    readonly pairs: Uint32Array;
    /** E rest lengths, measured in the domain */
    readonly rest: Float32Array;
}

/** The unique edges of the triangulation, with domain rest lengths. */
export function buildSpringEdges(sheet: SheetGeometry): SpringEdges {
    const seen = new Set<number>();
    const pairsList: number[] = [];
    for (let t = 0; t < sheet.T; t++) {
        for (let e = 0; e < 3; e++) {
            const a = sheet.indices[3 * t + e]!;
            const b = sheet.indices[3 * t + ((e + 1) % 3)]!;
            const key = Math.min(a, b) * sheet.V + Math.max(a, b);
            if (seen.has(key)) continue;
            seen.add(key);
            pairsList.push(a, b);
        }
    }
    const pairs = new Uint32Array(pairsList);
    const rest = new Float32Array(pairs.length / 2);
    for (let e = 0; e < rest.length; e++) {
        const a = pairs[2 * e]!;
        const b = pairs[2 * e + 1]!;
        rest[e] = Math.hypot(
            sheet.domain[2 * a]! - sheet.domain[2 * b]!,
            sheet.domain[2 * a + 1]! - sheet.domain[2 * b + 1]!,
        );
    }
    return { pairs, rest };
}

/**
 * Fabric relaxation: Gauss–Seidel passes nudging every edge toward its
 * DOMAIN rest length. Because crease folds are isometries, springs are
 * indifferent to folds — relaxation removes stretch (cloth tension
 * propagating through the sheet) while leaving folds folded. `pinWeights`
 * (0..1 per vertex) holds vertices the hand is gripping. Positions are
 * kept inside D².
 */
export function relaxSprings(
    sheet: { V: number },
    edges: SpringEdges,
    positions: Float32Array,
    options: {
        iterations?: number;
        stiffness?: number;
        pinWeights?: Float32Array | null;
        /** "compress-only" resists scrunching but leaves stretch free —
         *  the anti-"folds-up-too-small" mode for sculpting */
        mode?: "both" | "compress-only" | "stretch-only";
    } = {},
): void {
    const iterations = options.iterations ?? 4;
    const stiffness = options.stiffness ?? 0.3;
    const pins = options.pinWeights ?? null;
    const mode = options.mode ?? "both";
    const E = edges.rest.length;

    // Jacobi accumulation normalized by vertex valence: unconditionally
    // stable for stiffness ≤ 1, where sequential in-place updates overshoot
    // and tangle the mesh on strongly compressed configurations
    let scratch = springScratch.get(edges);
    if (!scratch || scratch.acc.length !== 2 * sheet.V) {
        scratch = { acc: new Float32Array(2 * sheet.V), count: new Float32Array(sheet.V) };
        springScratch.set(edges, scratch);
    }
    const { acc, count } = scratch;

    for (let iter = 0; iter < iterations; iter++) {
        acc.fill(0);
        count.fill(0);
        for (let e = 0; e < E; e++) {
            const a = edges.pairs[2 * e]!;
            const b = edges.pairs[2 * e + 1]!;
            const dx = positions[2 * b]! - positions[2 * a]!;
            const dy = positions[2 * b + 1]! - positions[2 * a + 1]!;
            const len = Math.hypot(dx, dy);
            if (len < 1e-9) continue;
            const deficit = len - edges.rest[e]!;
            if (mode === "compress-only" && deficit >= 0) continue;
            if (mode === "stretch-only" && deficit <= 0) continue;
            // positive when stretched: pull ends together by the deficit
            const correction = (stiffness * 0.5 * deficit) / len;
            acc[2 * a] = acc[2 * a]! + correction * dx;
            acc[2 * a + 1] = acc[2 * a + 1]! + correction * dy;
            acc[2 * b] = acc[2 * b]! - correction * dx;
            acc[2 * b + 1] = acc[2 * b + 1]! - correction * dy;
            count[a] = count[a]! + 1;
            count[b] = count[b]! + 1;
        }
        for (let i = 0; i < sheet.V; i++) {
            const n = count[i]!;
            if (n === 0) continue;
            const free = pins ? 1 - pins[i]! : 1;
            positions[2 * i] = positions[2 * i]! + (free * acc[2 * i]!) / n;
            positions[2 * i + 1] = positions[2 * i + 1]! + (free * acc[2 * i + 1]!) / n;
        }
    }
    // stay inside the disk
    for (let i = 0; i < sheet.V; i++) {
        const r = Math.hypot(positions[2 * i]!, positions[2 * i + 1]!);
        if (r > 1) {
            positions[2 * i] = positions[2 * i]! / r;
            positions[2 * i + 1] = positions[2 * i + 1]! / r;
        }
    }
}

const springScratch = new WeakMap<SpringEdges, { acc: Float32Array; count: Float32Array }>();

// --------------------------------------------------------------- smoothing

export interface Neighborhoods {
    /** CSR offsets, length V+1 */
    readonly start: Uint32Array;
    /** concatenated neighbor lists */
    readonly list: Uint32Array;
}

/** Adjacency lists from the triangle soup (shared by disk and sphere). */
function adjacencyLists(topo: SheetTopology): number[][] {
    const lists: number[][] = Array.from({ length: topo.V }, () => []);
    for (let t = 0; t < topo.T; t++) {
        for (let e = 0; e < 3; e++) {
            const a = topo.indices[3 * t + e]!;
            const b = topo.indices[3 * t + ((e + 1) % 3)]!;
            if (!lists[a]!.includes(b)) lists[a]!.push(b);
            if (!lists[b]!.includes(a)) lists[b]!.push(a);
        }
    }
    return lists;
}

function toCSR(lists: number[][]): Neighborhoods {
    const V = lists.length;
    const start = new Uint32Array(V + 1);
    for (let i = 0; i < V; i++) start[i + 1] = start[i]! + lists[i]!.length;
    const list = new Uint32Array(start[V]!);
    for (let i = 0, k = 0; i < V; i++) for (const n of lists[i]!) list[k++] = n;
    return { start, list };
}

/** Plain vertex adjacency of any triangulated sheet (no boundary special-
 *  casing — closed surfaces like the sphere grid use this directly). */
export function buildAdjacency(topo: SheetTopology): Neighborhoods {
    return toCSR(adjacencyLists(topo));
}

/**
 * Vertex neighborhoods for smoothing. Rim vertices deliberately keep ONLY
 * their two rim neighbors: the boundary is smoothed as a curve along
 * itself, so averaging never drags the sheet's edge inward.
 */
export function buildNeighborhoods(grid: DiskGrid): Neighborhoods {
    const { rings, sectors } = grid;
    const rimStart = 1 + (rings - 1) * sectors;
    const lists = adjacencyLists(grid);
    for (let j = 0; j < sectors; j++) {
        const v = rimStart + j;
        lists[v] = [rimStart + ((j + 1) % sectors), rimStart + ((j + sectors - 1) % sectors)];
    }
    return toCSR(lists);
}

/**
 * Wrinkle-ironing: Jacobi passes relaxing the DISPLACEMENT field
 * d = position − domain toward its neighborhood average. Constant and
 * (nearly) linear displacements — translations, stretches, shears — are
 * (almost) fixed points, so deformation stays free; high-frequency noise
 * and overly tight crumples decay. The identity (d ≡ 0) is fixed EXACTLY.
 * `pinWeights` holds grabbed vertices; `scratch` must be a Float32Array of
 * length 2V (caller-owned to keep this allocation-free).
 */
export function smoothDisplacements(
    sheet: { V: number; domain: Float32Array },
    hood: Neighborhoods,
    positions: Float32Array,
    scratch: Float32Array,
    options: { lambda?: number; iterations?: number; pinWeights?: Float32Array | null } = {},
): void {
    const lambda = options.lambda ?? 0.4;
    const iterations = options.iterations ?? 2;
    const pins = options.pinWeights ?? null;
    const { V, domain } = sheet;

    for (let iter = 0; iter < iterations; iter++) {
        for (let i = 0; i < V; i++) {
            const from = hood.start[i]!;
            const to = hood.start[i + 1]!;
            let ax = 0;
            let ay = 0;
            for (let k = from; k < to; k++) {
                const n = hood.list[k]!;
                ax += positions[2 * n]! - domain[2 * n]!;
                ay += positions[2 * n + 1]! - domain[2 * n + 1]!;
            }
            const count = to - from;
            ax /= count;
            ay /= count;
            const dx = positions[2 * i]! - domain[2 * i]!;
            const dy = positions[2 * i + 1]! - domain[2 * i + 1]!;
            const free = lambda * (pins ? 1 - pins[i]! : 1);
            scratch[2 * i] = domain[2 * i]! + dx + free * (ax - dx);
            scratch[2 * i + 1] = domain[2 * i + 1]! + dy + free * (ay - dy);
        }
        // clamp into the disk while copying back
        for (let i = 0; i < V; i++) {
            let px = scratch[2 * i]!;
            let py = scratch[2 * i + 1]!;
            const r = Math.hypot(px, py);
            if (r > 1) {
                px /= r;
                py /= r;
            }
            positions[2 * i] = px;
            positions[2 * i + 1] = py;
        }
    }
}

// ------------------------------------------------------------- PL disk map

/**
 * A piecewise-linear disk map defined by the grid itself: assign each
 * vertex an image position and interpolate barycentrically. This is the
 * sculpting editor's native representation — dragging edits `positions`
 * directly, folds are baked in by transforming the positions, and since D²
 * is convex, any positions inside the disk give a disk-valued map for free.
 *
 * evalDisk does O(1) point location using the polar structure of the grid
 * (ring index from |x|, sector from arg x, then one of two triangles in
 * the cell — matching createDiskGrid's split exactly).
 */
export interface PLDiskMap extends DiskMap {
    readonly grid: DiskGrid;
    /** 2V interleaved image coordinates — mutate freely, then redraw */
    readonly positions: Float32Array;
    snapshot(): Float32Array;
    restore(snap: Float32Array): void;
    resetToIdentity(): void;
}

export function plDiskMap(grid: DiskGrid): PLDiskMap {
    const positions = new Float32Array(grid.domain);
    const { rings, sectors, domain } = grid;
    const TWO_PI = 2 * Math.PI;

    // barycentric evaluation in the triangle (a, b, c), reading DOMAIN
    // coordinates for the weights and IMAGE positions for the value
    function evalInTriangle(
        px: number,
        py: number,
        a: number,
        b: number,
        c: number,
        out: Vec2,
        commit: boolean,
    ): boolean {
        const ax = domain[2 * a]!;
        const ay = domain[2 * a + 1]!;
        const abx = domain[2 * b]! - ax;
        const aby = domain[2 * b + 1]! - ay;
        const acx = domain[2 * c]! - ax;
        const acy = domain[2 * c + 1]! - ay;
        const det = abx * acy - acx * aby;
        const lb = ((px - ax) * acy - acx * (py - ay)) / det;
        const lc = (abx * (py - ay) - (px - ax) * aby) / det;
        const la = 1 - lb - lc;
        if (!commit && (la < -1e-9 || lb < -1e-9 || lc < -1e-9)) return false;
        out.x = la * positions[2 * a]! + lb * positions[2 * b]! + lc * positions[2 * c]!;
        out.y = la * positions[2 * a + 1]! + lb * positions[2 * b + 1]! + lc * positions[2 * c + 1]!;
        return true;
    }

    return {
        id: "pl-disk-map",
        name: "sculpted sheet",
        params: {},
        grid,
        positions,
        evalDisk: (x, _t, out) => {
            let px = x.x;
            let py = x.y;
            const r = Math.hypot(px, py);
            if (r > 1) {
                px /= r;
                py /= r;
            }
            const theta = ((Math.atan2(py, px) % TWO_PI) + TWO_PI) % TWO_PI;
            const j = Math.min(Math.floor((theta / TWO_PI) * sectors), sectors - 1);
            const j1 = (j + 1) % sectors;
            const k = Math.min(Math.floor(Math.min(r, 1) * rings), rings - 1);
            if (k === 0) {
                // central fan: (center, ring-1 j, ring-1 j+1)
                evalInTriangle(px, py, 0, 1 + j, 1 + j1, out, true);
                return out;
            }
            // quad between rings k and k+1, split as (A,B,C) + (A,C,D)
            const A = 1 + (k - 1) * sectors + j;
            const B = 1 + k * sectors + j;
            const C = 1 + k * sectors + j1;
            const D = 1 + (k - 1) * sectors + j1;
            if (!evalInTriangle(px, py, A, B, C, out, false)) {
                evalInTriangle(px, py, A, C, D, out, true);
            }
            return out;
        },
        snapshot() {
            return new Float32Array(positions);
        },
        restore(snap) {
            positions.set(snap);
        },
        resetToIdentity() {
            positions.set(domain);
        },
    };
}

/**
 * Map every grid vertex through f, writing 2V interleaved image
 * coordinates into `out`. Allocation-free — the hot path when map
 * parameters animate.
 */
export function pushforwardInto(
    grid: DiskGrid,
    f: DiskMap,
    time: number,
    out: Float32Array,
): void {
    const p = pushScratch;
    const q = pushScratchOut;
    for (let i = 0; i < grid.V; i++) {
        p.x = grid.domain[2 * i]!;
        p.y = grid.domain[2 * i + 1]!;
        f.evalDisk(p, time, q);
        out[2 * i] = q.x;
        out[2 * i + 1] = q.y;
    }
}
const pushScratch = vec2();
const pushScratchOut: Vec2 = vec2();

export interface OrientationCounts {
    preserving: number;
    reversing: number;
    /** |signed area| below `eps` — collapsed triangles */
    degenerate: number;
    /** reversing / (preserving + reversing) — 0 for an embedding */
    foldFraction: number;
}

/**
 * The fold census: classify each triangle by the sign of its image's
 * signed area (the discrete Jacobian determinant — the grid's domain
 * triangles are all CCW by construction).
 */
export function orientationCounts(
    grid: DiskGrid,
    positions: Float32Array,
    eps = 1e-12,
): OrientationCounts {
    let preserving = 0;
    let reversing = 0;
    let degenerate = 0;
    for (let t = 0; t < grid.T; t++) {
        const a = grid.indices[3 * t]!;
        const b = grid.indices[3 * t + 1]!;
        const c = grid.indices[3 * t + 2]!;
        const area = signedArea(
            positions[2 * a]!, positions[2 * a + 1]!,
            positions[2 * b]!, positions[2 * b + 1]!,
            positions[2 * c]!, positions[2 * c + 1]!,
        );
        if (Math.abs(area) < eps) degenerate++;
        else if (area > 0) preserving++;
        else reversing++;
    }
    const oriented = preserving + reversing;
    return {
        preserving,
        reversing,
        degenerate,
        foldFraction: oriented === 0 ? 0 : reversing / oriented,
    };
}

/** Twice-signed-area convention omitted: this is the honest ½·cross. */
export function signedArea(
    ax: number, ay: number,
    bx: number, by: number,
    cx: number, cy: number,
): number {
    return 0.5 * ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay));
}
