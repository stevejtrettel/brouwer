/**
 * SheetSculptor — the disk-playground editing machinery, factored out so any
 * demo can make a PL sheet (plDiskMap) editable the same way:
 *
 *   - GRAB the cloth anywhere and pull; the brush is measured in the panel's
 *     own coordinates, so every layer stacked under it (folded flaps included)
 *     moves together, with Gaussian falloff (brush σ);
 *   - drag a CORAL rim dot to FOLD: the crease is the perpendicular bisector
 *     of the drag, re-baked from a snapshot every move so it tracks live;
 *   - a light smoothing/spring "settle" relaxes wrinkles while you hold and
 *     briefly after release; snapshot undo; reset to any positions.
 *
 * The sculptor owns the pointer handlers, the rim/pinch feedback dots, the
 * settle loop, and the undo stack. It mutates `sheet.positions` in place and
 * calls back:
 *   - onEdit()   after every mutation — cheap; re-render the crumple/curves;
 *   - onCommit() on release and at settle-end — expensive; recompute census.
 *
 * Panels that apply a post-transform (e.g. the disk playground's shrink/move)
 * pass toSheet/toImage/brushSigmaScale; a plain sheet leaves them at identity.
 */

import type { Scene } from "three";
import type { App } from "../app/App.ts";
import type { Viewport } from "../app/ViewManager.ts";
import type { DiskGrid, SheetTopology } from "../math/diskGrid.ts";
import {
    buildAdjacency,
    buildNeighborhoods,
    buildSpringEdges,
    smoothDisplacements,
    relaxSprings,
} from "../math/diskGrid.ts";
import { creaseFold, foldTaking } from "../math/maps/diskMaps.ts";
import type { Vec2 } from "../math/types.ts";
import { vec2, set2 } from "../math/types.ts";
import { DiskDot } from "./panel2d.ts";
import { theme } from "./theme.ts";

export interface SheetBrush {
    sigma: number;
    smoothing: number;
    springback: number;
}

export interface SheetSculptorOptions {
    app: App;
    /** the panel viewport pointer coordinates are measured against */
    viewport: Viewport;
    /** scene the rim/pinch feedback dots are added to */
    scene: Scene;
    /** the disk grid — supplies topology, rest state, AND the rim fold-grips */
    grid?: DiskGrid;
    /** OR explicit topology for non-disk sheets (the flattened sphere image) */
    topology?: SheetTopology;
    /** 2V rest positions for smoothing reference + spring rest lengths
     *  (default grid.domain; REQUIRED with `topology`) */
    rest?: Float32Array;
    /** fold-grip vertex indices (default: 12 rim vertices from the grid;
     *  pass [] to disable the fold gesture — closed sheets have no rim) */
    gripVertices?: number[];
    /** anything holding 2V interleaved positions with snapshot/restore
     *  (PLDiskMap, PLSphereMap) */
    sheet: { positions: Float32Array; snapshot(): Float32Array; restore(snap: Float32Array): void };
    brush?: SheetBrush;
    /** panel (image) coords → sheet coords; default identity */
    toSheet?: (p: Vec2, out: Vec2) => void;
    /** sheet coords → panel (image) coords; default identity */
    toImage?: (p: Vec2, out: Vec2) => void;
    /** brush σ is divided by this (a post-scale); default 1 */
    brushSigmaScale?: () => number;
    /** rim fold-grip dot color (default the identity/coral role color) */
    gripColor?: number;
    /** rim fold-grip dot radius (default 0.042) */
    gripRadius?: number;
    /** pointer distance that counts as clicking a grip (default 3× the dot
     *  radius) — keep tight on crumpled sheets, where grips bunch up and a
     *  generous hit area steals every grab into a fold */
    gripHitRadius?: number;
    /** cheap: after every mutation (re-render) */
    onEdit: () => void;
    /** expensive: on release and settle-end (recompute census) */
    onCommit: () => void;
}

export interface SheetSculptor {
    readonly brush: SheetBrush;
    undo(): void;
    /** restore positions, clear undo, and commit — e.g. a reset button */
    reset(to: Float32Array): void;
    dispose(): void;
}

export function attachSheetSculptor(opts: SheetSculptorOptions): SheetSculptor {
    const { app, viewport, scene, grid, sheet, onEdit, onCommit } = opts;
    const brush = opts.brush ?? { sigma: 0.3, smoothing: 0.35, springback: 0.4 };
    const toSheet = opts.toSheet ?? ((p, out) => set2(out, p.x, p.y));
    const toImage = opts.toImage ?? ((p, out) => set2(out, p.x, p.y));
    const sigmaScale = opts.brushSigmaScale ?? (() => 1);
    const gripColor = opts.gripColor ?? theme.roles.identity;
    const gripRadius = opts.gripRadius ?? 0.042;
    const gripHitRadius = opts.gripHitRadius ?? 3 * gripRadius;

    const topo = opts.topology ?? grid;
    if (!topo) throw new Error("SheetSculptor needs a grid or an explicit topology");
    const rest = opts.rest ?? grid!.domain;
    const hood = grid ? buildNeighborhoods(grid) : buildAdjacency(topo);
    const springs = buildSpringEdges({ V: topo.V, T: topo.T, indices: topo.indices, domain: rest });
    const restSheet = { V: topo.V, domain: rest };
    const smoothScratch = new Float32Array(2 * topo.V);

    // rim fold-grips: 12 evenly spaced boundary vertices of the grid
    // (or the caller's own list — [] disables folding)
    const gripVertices: number[] = opts.gripVertices ?? [];
    if (!opts.gripVertices && grid) {
        for (let i = 0; i < 12; i++) {
            gripVertices.push(
                1 + (grid.rings - 1) * grid.sectors + Math.floor(i * (grid.sectors / 12)),
            );
        }
    }

    const rimDots = gripVertices.map(() => {
        const dot = new DiskDot(gripRadius);
        dot.setColor(gripColor);
        dot.position.z = 0.05;
        dot.visible = true;
        scene.add(dot);
        return dot;
    });
    const pinchDot = new DiskDot(0.045);
    pinchDot.position.z = 0.06;
    pinchDot.visible = false;
    scene.add(pinchDot);

    const scratch = vec2();
    const img = vec2();
    function updateRim(): void {
        for (let g = 0; g < gripVertices.length; g++) {
            const v = gripVertices[g]!;
            set2(scratch, sheet.positions[2 * v]!, sheet.positions[2 * v + 1]!);
            toImage(scratch, img);
            rimDots[g]!.position.x = img.x;
            rimDots[g]!.position.y = img.y;
        }
    }
    updateRim();

    // snapshot undo
    const undoStack: Float32Array[] = [];
    const MAX_UNDO = 60;
    function beginAction(): void {
        undoStack.push(sheet.snapshot());
        if (undoStack.length > MAX_UNDO) undoStack.shift();
    }

    type Drag =
        | { kind: "grab"; weights: Float32Array; affected: number[]; last: Vec2 }
        | { kind: "fold"; grip: number; origin: Vec2 };
    let drag: Drag | null = null;

    const pointer = vec2();
    const pre = vec2();
    const canvas = app.renderer.domElement;

    function pointerWorld(e: PointerEvent): boolean {
        return app.views.pointerToWorld(
            viewport,
            e.clientX,
            e.clientY,
            window.innerWidth,
            window.innerHeight,
            pointer,
        );
    }

    const onDown = (e: PointerEvent): void => {
        if (!pointerWorld(e)) return;
        drag = null;

        // rim grips take priority when clicked directly
        let bestRim = gripHitRadius;
        for (let g = 0; g < rimDots.length; g++) {
            const d = Math.hypot(rimDots[g]!.position.x - pointer.x, rimDots[g]!.position.y - pointer.y);
            if (d < bestRim) {
                bestRim = d;
                drag = { kind: "fold", grip: g, origin: vec2() };
            }
        }

        if (drag) {
            const v = gripVertices[drag.grip]!;
            set2(drag.origin, sheet.positions[2 * v]!, sheet.positions[2 * v + 1]!);
            rimDots[drag.grip]!.setColor(theme.marker);
            beginAction();
        } else {
            // grab: brush weights measured in SHEET space so every layer under
            // the brush moves together
            toSheet(pointer, pre);
            let nearest = Infinity;
            for (let i = 0; i < topo.V; i++) {
                const d = Math.hypot(sheet.positions[2 * i]! - pre.x, sheet.positions[2 * i + 1]! - pre.y);
                if (d < nearest) nearest = d;
            }
            if (nearest > 0.1) return; // require the cursor to touch the sheet

            const sigma = brush.sigma / sigmaScale();
            const s2 = 2 * sigma * sigma;
            const weights = new Float32Array(topo.V);
            const affected: number[] = [];
            for (let i = 0; i < topo.V; i++) {
                const dx = sheet.positions[2 * i]! - pre.x;
                const dy = sheet.positions[2 * i + 1]! - pre.y;
                const w = Math.exp(-(dx * dx + dy * dy) / s2);
                if (w > 1e-3) {
                    weights[i] = w;
                    affected.push(i);
                }
            }
            drag = { kind: "grab", weights, affected, last: vec2(pre.x, pre.y) };
            pinchDot.setColor(theme.marker);
            pinchDot.visible = true;
            beginAction();
        }
        canvas.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent): void => {
        if (!drag || !pointerWorld(e)) return;
        toSheet(pointer, pre);

        if (drag.kind === "grab") {
            const dx = pre.x - drag.last.x;
            const dy = pre.y - drag.last.y;
            set2(drag.last, pre.x, pre.y);
            for (const i of drag.affected) {
                const w = drag.weights[i]!;
                let px = sheet.positions[2 * i]! + w * dx;
                let py = sheet.positions[2 * i + 1]! + w * dy;
                const r = Math.hypot(px, py);
                if (r > 1) {
                    px /= r;
                    py /= r;
                }
                sheet.positions[2 * i] = px;
                sheet.positions[2 * i + 1] = py;
            }
            pinchDot.position.x = pointer.x;
            pinchDot.position.y = pointer.y;
        } else {
            // fold: crease = perpendicular bisector of [origin, cursor], re-baked
            // from the snapshot every move so it tracks the drag live
            const snap = undoStack[undoStack.length - 1]!;
            if (Math.hypot(pre.x - drag.origin.x, pre.y - drag.origin.y) < 0.03) {
                sheet.restore(snap);
            } else {
                const { t, angle } = foldTaking(drag.origin, pre);
                const fold = creaseFold(t, angle);
                const p = scratch;
                for (let i = 0; i < topo.V; i++) {
                    set2(p, snap[2 * i]!, snap[2 * i + 1]!);
                    fold.evalDisk(p, 0, p);
                    const r = Math.hypot(p.x, p.y);
                    if (r > 1) {
                        p.x /= r;
                        p.y /= r;
                    }
                    sheet.positions[2 * i] = p.x;
                    sheet.positions[2 * i + 1] = p.y;
                }
            }
        }
        updateRim();
        onEdit();
    };

    // fabric ironing: while grabbing (and briefly after) smooth the displacement
    // field — wrinkles relax while stretches pass through; grabbed region pinned
    let settleFrames = 0;
    app.addAnimateCallback(() => {
        if (brush.smoothing <= 0 && brush.springback <= 0) return;
        const grabbing = drag?.kind === "grab";
        if (!grabbing && settleFrames <= 0) return;
        const pins = grabbing ? (drag as Extract<Drag, { kind: "grab" }>).weights : null;
        if (brush.smoothing > 0) {
            smoothDisplacements(restSheet, hood, sheet.positions, smoothScratch, {
                iterations: 2,
                lambda: 0.5 * brush.smoothing,
                pinWeights: pins,
            });
        }
        if (brush.springback > 0) {
            relaxSprings(restSheet, springs, sheet.positions, {
                iterations: 2,
                stiffness: 0.35 * brush.springback,
                mode: "compress-only",
                pinWeights: pins,
            });
        }
        if (!grabbing) {
            settleFrames--;
            if (settleFrames === 0) onCommit();
        }
        updateRim();
        onEdit();
    });

    const onUp = (): void => {
        if (!drag) return;
        if (drag.kind === "grab") {
            pinchDot.visible = false;
            if (Math.hypot(pre.x - drag.last.x, pre.y - drag.last.y) < 1e-9) {
                // no-op click: don't spend an undo slot if nothing moved
                const snap = undoStack[undoStack.length - 1]!;
                let moved = false;
                for (let i = 0; i < 2 * topo.V; i++) {
                    if (Math.abs(sheet.positions[i]! - snap[i]!) > 1e-9) {
                        moved = true;
                        break;
                    }
                }
                if (!moved) undoStack.pop();
            }
            if (brush.smoothing > 0 || brush.springback > 0) settleFrames = 45;
        } else {
            rimDots[drag.grip]!.setColor(gripColor);
        }
        drag = null;
        updateRim();
        onEdit();
        onCommit();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);

    return {
        brush,
        undo() {
            const snap = undoStack.pop();
            if (snap) sheet.restore(snap);
            updateRim();
            onEdit();
            onCommit();
        },
        reset(to: Float32Array) {
            sheet.restore(to);
            undoStack.length = 0;
            updateRim();
            onEdit();
            onCommit();
        },
        dispose() {
            canvas.removeEventListener("pointerdown", onDown);
            canvas.removeEventListener("pointermove", onMove);
            canvas.removeEventListener("pointerup", onUp);
        },
    };
}
