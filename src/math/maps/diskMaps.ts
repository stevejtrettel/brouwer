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
import { softClampToDisk, projectToDisk } from "./project.ts";

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
 * A hand-sculpted disk map: displacements attached to fixed domain anchor
 * points, spread smoothly by a Gaussian kernel —
 *
 *     f(x) = project( x + Σᵢ exp(−|x − aᵢ|² / 2σ²) · dᵢ ).
 *
 * This is the crumple editor's map: dragging a handle sets its dᵢ, and the
 * kernel turns the pokes into a continuous deformation. With all dᵢ = 0
 * the map is the EXACT identity (hard projection is the identity inside
 * D², unlike the soft clamp), so the editor starts from a clean slate.
 * σ is the "stiffness": small σ makes pokes local, large σ drags the whole
 * sheet. Displacements live in `params` (d0x, d0y, …) so parameter-keyed
 * caches (fixed-point census, fold census) invalidate on every drag.
 */
export interface HandleWarp extends DiskMap {
    readonly anchors: readonly Vec2[];
    setDisplacement(i: number, dx: number, dy: number): void;
    addDisplacement(i: number, dx: number, dy: number): void;
    reset(): void;
}

export function handleWarp(anchors: Vec2[], sigma = 0.4): HandleWarp {
    const params: Record<string, number> = { sigma };
    for (let i = 0; i < anchors.length; i++) {
        params[`d${i}x`] = 0;
        params[`d${i}y`] = 0;
    }
    const raw = vec2();
    return {
        id: "handle-warp",
        name: "handle warp",
        params,
        anchors,
        evalDisk: (x, _t, out) => {
            let px = x.x;
            let py = x.y;
            const s2 = 2 * params.sigma! * params.sigma!;
            for (let i = 0; i < anchors.length; i++) {
                const ax = anchors[i]!.x - x.x;
                const ay = anchors[i]!.y - x.y;
                const w = Math.exp(-(ax * ax + ay * ay) / s2);
                px += w * params[`d${i}x`]!;
                py += w * params[`d${i}y`]!;
            }
            set2(raw, px, py);
            return projectToDisk(out, raw);
        },
        setDisplacement(i, dx, dy) {
            params[`d${i}x`] = dx;
            params[`d${i}y`] = dy;
        },
        addDisplacement(i, dx, dy) {
            params[`d${i}x`]! += dx;
            params[`d${i}y`]! += dy;
        },
        reset() {
            for (let i = 0; i < anchors.length; i++) {
                params[`d${i}x`] = 0;
                params[`d${i}y`] = 0;
            }
        },
    };
}

/**
 * Fold the disk across a chord: in a frame rotated by `angle`, points with
 * v > t reflect to 2t − v (a hard but continuous crease along the chord
 * v = t). No clamp is needed — folding across a chord maps D² into itself
 * EXACTLY: for a boundary point, the folded norm² is 1 + 4t(t − v) < 1
 * whenever v > t. This is the canonical crumpling ingredient: it makes the
 * image genuinely self-overlap, with the folded flap orientation-reversed.
 */
export function creaseFold(t = 0.45, angle = 1.9): DiskMap {
    const params = { t, angle };
    return {
        id: "crease-fold",
        name: "crease fold",
        params,
        evalDisk: (x, _t, out) => {
            const cos = Math.cos(params.angle);
            const sin = Math.sin(params.angle);
            const u = x.x * cos + x.y * sin;
            let v = -x.x * sin + x.y * cos;
            if (v > params.t) v = 2 * params.t - v;
            return set2(out, u * cos - v * sin, u * sin + v * cos);
        },
    };
}

/**
 * strokeWarp — the cloth-grab map. Unlike handleWarp's fixed anchors, each
 * pointer-down BEGINS A STROKE at the grabbed material point (a domain
 * coordinate), and dragging accumulates that stroke's displacement:
 *
 *     f(x) = project( x + Σ_strokes exp(−|x − aᵢ|²/2σᵢ²) · dᵢ ).
 *
 * The kernel makes nearby cloth follow the pull with smooth falloff; σ is
 * the brush size, captured per stroke so brushes of different sizes
 * compose. Exact identity with no strokes.
 */
export interface Stroke {
    anchor: Vec2;
    sigma: number;
    dx: number;
    dy: number;
}

export interface StrokeWarp extends DiskMap {
    readonly strokes: Stroke[];
    /** start a stroke pinching the cloth at `anchor`; returns its index */
    beginStroke(anchor: Vec2, sigma: number): number;
    moveStroke(index: number, dx: number, dy: number): void;
    undoStroke(): void;
    reset(): void;
}

export function strokeWarp(): StrokeWarp {
    const strokes: Stroke[] = [];
    const params: Record<string, number> = { strokes: 0 };
    const raw = vec2();
    return {
        id: "stroke-warp",
        name: "cloth grab",
        params,
        strokes,
        evalDisk: (x, _t, out) => {
            let px = x.x;
            let py = x.y;
            for (const s of strokes) {
                const ax = s.anchor.x - x.x;
                const ay = s.anchor.y - x.y;
                const weight = Math.exp(-(ax * ax + ay * ay) / (2 * s.sigma * s.sigma));
                px += weight * s.dx;
                py += weight * s.dy;
            }
            set2(raw, px, py);
            return projectToDisk(out, raw);
        },
        beginStroke(anchor, sigma) {
            strokes.push({ anchor: vec2(anchor.x, anchor.y), sigma, dx: 0, dy: 0 });
            params.strokes = strokes.length;
            return strokes.length - 1;
        },
        moveStroke(index, dx, dy) {
            const s = strokes[index]!;
            s.dx += dx;
            s.dy += dy;
        },
        undoStroke() {
            strokes.pop();
            params.strokes = strokes.length;
        },
        reset() {
            strokes.length = 0;
            params.strokes = 0;
        },
    };
}

/**
 * The crease parameters of the fold whose reflection carries `from` to
 * `to`: the crease is the PERPENDICULAR BISECTOR of the segment [from, to].
 * This is the interactive folding gesture — grab a point, drag it over the
 * sheet, and the crease follows. When `from` lies on ∂D² and `to` is
 * inside, the chord offset is automatically t = (1 − |to|²)/2L ≥ 0, the
 * regime where creaseFold maps the disk exactly into itself.
 */
export function foldTaking(from: Vec2, to: Vec2): { t: number; angle: number } {
    const nx = from.x - to.x;
    const ny = from.y - to.y;
    const L = Math.hypot(nx, ny);
    if (L < 1e-12) return { t: 1, angle: 0 }; // inert fold
    // creaseFold's fold axis is n̂ = (−sin α, cos α)
    const angle = Math.atan2(-nx / L, ny / L);
    const t = ((from.x + to.x) / 2) * (nx / L) + ((from.y + to.y) / 2) * (ny / L);
    return { t, angle };
}

/**
 * Similarity y ↦ s·y + c, hard-projected into the disk: shrinks and
 * translates a whole picture around inside D². Exact identity at
 * (s, cx, cy) = (1, 0, 0).
 */
export function similarityMap(s = 1, cx = 0, cy = 0): DiskMap {
    const params = { s, cx, cy };
    const tmp = vec2();
    return {
        id: "similarity",
        name: "shrink + move",
        params,
        evalDisk: (x, _t, out) => {
            set2(tmp, params.s * x.x + params.cx, params.s * x.y + params.cy);
            return projectToDisk(out, tmp);
        },
    };
}

/**
 * Composition (outer ∘ inner) as a single DiskMap. The composite's `params`
 * exposes both maps' live parameters through prefixed getter properties, so
 * caches keyed on JSON.stringify(params) see changes to either factor.
 */
export function composeDiskMaps(outer: DiskMap, inner: DiskMap): DiskMap {
    const params: Record<string, number> = {};
    for (const [prefix, map] of [
        ["inner", inner],
        ["outer", outer],
    ] as const) {
        for (const key of Object.keys(map.params)) {
            Object.defineProperty(params, `${prefix}.${key}`, {
                enumerable: true,
                get: () => map.params[key]!,
            });
        }
    }
    const mid = vec2();
    return {
        id: `${outer.id}∘${inner.id}`,
        name: `${outer.name} ∘ ${inner.name}`,
        params,
        evalDisk: (x, time, out) => {
            inner.evalDisk(x, time, mid);
            return outer.evalDisk(mid, time, out);
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
