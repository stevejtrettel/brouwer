/**
 * SphereBrush — comb a PL tangent field by dragging on the 3D sphere view
 * (the Poincaré experiment mode). The comb analogue of SheetSculptor's
 * grab, with the same skeleton (undo stack, settle loop, onEdit/onCommit
 * contract) adapted to a perspective viewport and vector-valued state:
 *
 *   - the pointer ray (per-viewport NDC → Raycaster) is intersected with
 *     the unit sphere ANALYTICALLY — no mesh raycast;
 *   - dragging sweeps an ambient delta Δ = hit − lastHit; each vertex under
 *     the brush receives Δ projected onto ITS tangent plane, scaled by a
 *     chordal-distance Gaussian and the brush strength, then soft-clamped —
 *     exactly how a comb transports a stroke;
 *   - while combing (and briefly after release) smoothTangentVectors irons
 *     the stroke; onCommit fires at settle-end (census recompute).
 *
 * The demo owns the comb-mode toggle: `enabled` gates the gesture, and the
 * matching SphereView.setOrbitGate keeps OrbitControls out of the way.
 */

import { Raycaster, Vector2, Vector3, type PerspectiveCamera } from "three";
import type { App } from "../app/App.ts";
import type { Viewport } from "../app/ViewManager.ts";
import type { SphereGrid, PLTangentField } from "../math/sphereGrid.ts";
import { smoothTangentVectors } from "../math/sphereGrid.ts";
import { buildAdjacency } from "../math/diskGrid.ts";
import { softClampLength } from "../math/maps/tangentFields.ts";
import { vec3 } from "../math/types.ts";
import { worldToMath } from "./arrows.ts";

export interface CombBrush {
    /** chordal Gaussian radius on the sphere */
    sigma: number;
    /** stroke gain: how much vector a unit drag deposits */
    strength: number;
    /** settle-loop smoothing amount */
    smoothing: number;
}

export interface SphereBrushOptions {
    app: App;
    /** the sphere view's viewport (perspective) */
    viewport: Viewport;
    camera: PerspectiveCamera;
    grid: SphereGrid;
    field: PLTangentField;
    brush?: CombBrush;
    /** comb-mode gate — the demo owns the toggle */
    enabled: () => boolean;
    /** cheap: after every mutation (arrows refit, curve refill) */
    onEdit: () => void;
    /** expensive: on release and settle-end (census recompute) */
    onCommit: () => void;
}

export interface SphereBrush {
    readonly brush: CombBrush;
    /** a stroke is in progress (entries pause sphere auto-rotate on this) */
    readonly active: boolean;
    undo(): void;
    /** restore vectors, clear undo, and commit — e.g. a reset button */
    reset(to: Float32Array): void;
    dispose(): void;
}

const MAX_UNDO = 60;

export function attachSphereBrush(opts: SphereBrushOptions): SphereBrush {
    const { app, viewport, camera, grid, field, enabled, onEdit, onCommit } = opts;
    const brush = opts.brush ?? { sigma: 0.35, strength: 2, smoothing: 0.35 };

    const hood = buildAdjacency(grid);
    const smoothScratch = new Float32Array(3 * grid.V);

    // snapshot undo (SheetSculptor's scheme)
    const undoStack: Float32Array[] = [];
    function beginAction(): void {
        undoStack.push(field.snapshot());
        if (undoStack.length > MAX_UNDO) undoStack.shift();
    }

    interface Drag {
        weights: Float32Array;
        affected: number[];
        last: { x: number; y: number; z: number }; // math coords of last hit
    }
    let drag: Drag | null = null;

    const ndc = new Vector2();
    const raycaster = new Raycaster();
    const hitWorld = new Vector3();
    const hit = vec3();
    const delta = vec3();
    const stroke = vec3();
    const vertex = vec3();
    const canvas = app.renderer.domElement;

    /** Pointer → math-coordinates point on the unit sphere, or false. */
    function pointerToSphere(e: PointerEvent): boolean {
        if (!app.views.pointerToNDC(viewport, e.clientX, e.clientY, ndc)) return false;
        raycaster.setFromCamera(ndc, camera);
        // analytic unit-sphere intersection: |o + t·d|² = 1, d unit
        const o = raycaster.ray.origin;
        const dir = raycaster.ray.direction;
        const b = o.dot(dir);
        const c = o.lengthSq() - 1;
        const disc = b * b - c;
        if (disc < 0) return false;
        const t = -b - Math.sqrt(disc);
        if (t < 0) return false;
        hitWorld.copy(dir).multiplyScalar(t).add(o);
        worldToMath(hitWorld, hit);
        return true;
    }

    // pointer arbitration: a stroke belongs to the PRIMARY button of the
    // FIRST pointer down. Secondary buttons and second fingers are left to
    // OrbitControls (entries that comb by default hand it right-drag /
    // two-finger), and a second finger arriving mid-stroke ends the stroke
    // rather than smearing it under a two-finger orbit.
    let strokePointer: number | null = null;
    const onDown = (e: PointerEvent): void => {
        if (strokePointer !== null) {
            if (drag) onUp();
            return;
        }
        if (e.button !== 0 || !e.isPrimary) return;
        if (!enabled() || !pointerToSphere(e)) return;
        strokePointer = e.pointerId;

        const s2 = 2 * brush.sigma * brush.sigma;
        const weights = new Float32Array(grid.V);
        const affected: number[] = [];
        for (let i = 0; i < grid.V; i++) {
            const dx = grid.domain[3 * i]! - hit.x;
            const dy = grid.domain[3 * i + 1]! - hit.y;
            const dz = grid.domain[3 * i + 2]! - hit.z;
            const w = Math.exp(-(dx * dx + dy * dy + dz * dz) / s2);
            if (w > 1e-3) {
                weights[i] = w;
                affected.push(i);
            }
        }
        drag = { weights, affected, last: { x: hit.x, y: hit.y, z: hit.z } };
        beginAction();
        canvas.setPointerCapture(e.pointerId);
    };

    const onMove = (e: PointerEvent): void => {
        if (!drag || e.pointerId !== strokePointer || !pointerToSphere(e)) return;
        delta.x = hit.x - drag.last.x;
        delta.y = hit.y - drag.last.y;
        delta.z = hit.z - drag.last.z;
        drag.last.x = hit.x;
        drag.last.y = hit.y;
        drag.last.z = hit.z;

        for (const i of drag.affected) {
            const w = brush.strength * drag.weights[i]!;
            vertex.x = grid.domain[3 * i]!;
            vertex.y = grid.domain[3 * i + 1]!;
            vertex.z = grid.domain[3 * i + 2]!;
            // the stroke, transported: Δ projected onto THIS vertex's plane
            const dot = delta.x * vertex.x + delta.y * vertex.y + delta.z * vertex.z;
            stroke.x = field.vectors[3 * i]! + w * (delta.x - dot * vertex.x);
            stroke.y = field.vectors[3 * i + 1]! + w * (delta.y - dot * vertex.y);
            stroke.z = field.vectors[3 * i + 2]! + w * (delta.z - dot * vertex.z);
            softClampLength(stroke);
            field.vectors[3 * i] = stroke.x;
            field.vectors[3 * i + 1] = stroke.y;
            field.vectors[3 * i + 2] = stroke.z;
        }
        onEdit();
    };

    // ironing: while combing (and briefly after) smooth the vectors — the
    // stroke stays (pinned under the brush), the jaggies relax
    let settleFrames = 0;
    app.addAnimateCallback(() => {
        if (brush.smoothing <= 0) return;
        const combing = drag !== null;
        if (!combing && settleFrames <= 0) return;
        smoothTangentVectors(grid, hood, field.vectors, smoothScratch, {
            iterations: 2,
            lambda: 0.5 * brush.smoothing,
            pinWeights: combing ? drag!.weights : null,
        });
        if (!combing) {
            settleFrames--;
            if (settleFrames === 0) onCommit();
        }
        onEdit();
    });

    const onUp = (e?: PointerEvent): void => {
        if (e && strokePointer !== null && e.pointerId !== strokePointer) return;
        strokePointer = null;
        if (!drag) return;
        // no-op click: don't spend an undo slot if nothing moved
        const snap = undoStack[undoStack.length - 1]!;
        let moved = false;
        for (let i = 0; i < 3 * grid.V; i++) {
            if (Math.abs(field.vectors[i]! - snap[i]!) > 1e-9) {
                moved = true;
                break;
            }
        }
        if (!moved) undoStack.pop();
        else if (brush.smoothing > 0) settleFrames = 45;
        drag = null;
        onEdit();
        onCommit();
    };

    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    return {
        brush,
        get active() {
            return drag !== null;
        },
        undo() {
            const snap = undoStack.pop();
            if (snap) field.restore(snap);
            onEdit();
            onCommit();
        },
        reset(to) {
            field.restore(to);
            undoStack.length = 0;
            onEdit();
            onCommit();
        },
        dispose() {
            canvas.removeEventListener("pointerdown", onDown);
            canvas.removeEventListener("pointermove", onMove);
            canvas.removeEventListener("pointerup", onUp);
            canvas.removeEventListener("pointercancel", onUp);
        },
    };
}
