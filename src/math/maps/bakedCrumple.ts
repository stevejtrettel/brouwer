/**
 * The canonical baked crumple — a whole sculpting session (Gaussian grabs
 * and hard creases) applied to a PL disk sheet, so demos open on a
 * genuinely crumpled map rather than a tidy formula. Shared by the brouwer
 * demo and the graphs demo so "the" crumpled map is the same everywhere.
 *
 * Alongside the map it returns the fold-layer census: each crease bumps
 * the reflected vertices one layer, which is exactly the stacking order a
 * physically folded sheet would have (CrumpledSheet's z-lift).
 *
 * The census is returned SMOOTHED, because the raw counts step by a whole
 * layer between neighbouring vertices: a crease of literally zero radius,
 * whose triangles are near-degenerate exactly where the sheet doubles back,
 * so a sharp fold tears rather than bends. Both consumers — the sheet mesh
 * and the image curve riding its folds — read this one array, so it has to be
 * rounded here, at the source, or the curve would ride a surface that is no
 * longer where it thinks it is.
 */

import type { Vec2 } from "../types.ts";
import { set2, vec2 } from "../types.ts";
import type { DiskGrid, PLDiskMap } from "../diskGrid.ts";
import { buildAdjacency, plDiskMap, smoothVertexScalar } from "../diskGrid.ts";
import { creaseFold, foldTaking } from "./diskMaps.ts";

export interface BakedCrumple {
    map: PLDiskMap;
    /** V fold-layer heights: integer crease counts, diffused over the sheet so
     *  each fold has a bend radius instead of a one-edge cliff */
    layers: Float32Array;
}

export function bakeCrumple(grid: DiskGrid, options: { wild?: boolean } = {}): BakedCrumple {
    const sheet = plDiskMap(grid);
    const pos = sheet.positions;
    const layers = new Float32Array(grid.V);
    const scratch = vec2();

    function clampVertex(i: number): void {
        const r = Math.hypot(pos[2 * i]!, pos[2 * i + 1]!);
        if (r > 1) {
            pos[2 * i]! /= r;
            pos[2 * i + 1]! /= r;
        }
    }
    function grab(cx: number, cy: number, dx: number, dy: number, sigma: number): void {
        const s2 = 2 * sigma * sigma;
        for (let i = 0; i < grid.V; i++) {
            const px = pos[2 * i]!;
            const py = pos[2 * i + 1]!;
            const w = Math.exp(-((px - cx) ** 2 + (py - cy) ** 2) / s2);
            pos[2 * i] = px + w * dx;
            pos[2 * i + 1] = py + w * dy;
            clampVertex(i);
        }
    }
    function fold(fx: number, fy: number, tx: number, ty: number): void {
        const from: Vec2 = vec2(fx, fy);
        const to: Vec2 = vec2(tx, ty);
        const { t, angle } = foldTaking(from, to);
        const crease = creaseFold(t, angle);
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        for (let i = 0; i < grid.V; i++) {
            const v = -pos[2 * i]! * sin + pos[2 * i + 1]! * cos;
            if (v > t) layers[i]! += 1;
            set2(scratch, pos[2 * i]!, pos[2 * i + 1]!);
            crease.evalDisk(scratch, 0, scratch);
            pos[2 * i] = scratch.x;
            pos[2 * i + 1] = scratch.y;
            clampVertex(i);
        }
    }

    /** radial expansion p ↦ p·(a + b·|p|), hard-clamped — pushes the whole
     *  image out toward the boundary */
    function expand(a: number, b: number): void {
        for (let i = 0; i < grid.V; i++) {
            const s = a + b * Math.hypot(pos[2 * i]!, pos[2 * i + 1]!);
            pos[2 * i]! *= s;
            pos[2 * i + 1]! *= s;
            clampVertex(i);
        }
    }

    /** Fold the RIM FLAP at angle α inward: the crease is the perpendicular
     *  bisector from the boundary point to `depth` along a slightly rotated
     *  ray, so only the outer cap turns over.
     *
     *  Folding a boundary point to somewhere near the ORIGIN — which this
     *  recipe used to do — creases through the middle and halves the image
     *  every time. Three of those left f(D²) covering a quarter of the disk:
     *  honest, but it reads as a folded napkin on an empty plate, and the
     *  establishing figure is supposed to show a crumpled map SMUSHED ONTO
     *  another map. Shallow flaps keep the image spread while creasing it just
     *  as genuinely, and they also serve the brouwer figures, where Γ_f wants
     *  to ride big and far from the core. */
    function foldRim(alpha: number, depth: number, skew: number): void {
        fold(
            Math.cos(alpha),
            Math.sin(alpha),
            depth * Math.cos(alpha + skew),
            depth * Math.sin(alpha + skew),
        );
    }

    grab(0.15, 0.1, -0.7, -0.55, 0.6);
    foldRim(2.2, 0.5, -0.3);
    grab(-0.35, -0.25, 0.7, 0.45, 0.55);
    foldRim(-0.6, 0.5, 0.3);
    grab(0.35, -0.2, -0.35, 0.7, 0.5);
    foldRim(1.0, 0.45, 0.35);

    if (options.wild) {
        // figure staging: Γ_f should ride big, far from the core, and
        // visibly crumpled, so the push-to-core has somewhere to go —
        // shove the image outward and crease once more
        expand(1.18, 0.3);
        grab(-0.05, 0.5, 0.4, 0.35, 0.5);
        foldRim(2.9, 0.5, 0.3);
        foldRim(4.4, 0.55, -0.35);
    }

    // Round the creases. Ten passes spreads a layer step over roughly three
    // cells of the grid; away from a crease the field is locally constant, so
    // the flat stacked flaps are untouched and keep their full separation.
    return { map: sheet, layers: smoothVertexScalar(buildAdjacency(grid), layers) };
}
