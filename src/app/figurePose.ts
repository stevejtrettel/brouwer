/**
 * Canonical figure poses.
 *
 * Every paper figure of the same object is shot from the SAME camera, for two
 * reasons. The set reads as a sequence — Brouwer's unlinked/linked/push figures
 * sit in a row and only the mathematics changes between them — and, because
 * renders carry no labels of their own (they go on in LaTeX over the image), a
 * pinned pose is what keeps an overlay's coordinates valid when a figure is
 * re-rendered.
 *
 * So: presets call applyPose() instead of setting a camera by hand. Tune a pose
 * HERE and every figure of that object moves together.
 */

import type { PerspectiveCamera } from "three";
import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

export interface FigurePose {
    /** camera position in world units */
    position: [number, number, number];
    /** orbit target — what the figure is composed around */
    target: [number, number, number];
}

/** The house three-quarter view of the solid torus: high enough to read the
 *  hole and the core, low enough that curves crossing the far side still show
 *  their over/under. Distance suits an R = 2, a = 0.6 torus in a 16:10 frame. */
export const TORUS_THREE_QUARTER: FigurePose = {
    position: [0, 4.4, 7.8],
    target: [0, 0, 0],
};

/** Same view, pulled back for figures with furniture beside the torus (the
 *  slice plate, the spanning disk). */
export const TORUS_WITH_PLATE: FigurePose = {
    position: [-0.9, 4.6, 8.9],
    target: [-0.9, 0.1, 0],
};

/** The Borsuk band, shot lower than the house view. The subject is a twisting
 *  SURFACE, and elevation flattens a twist: from high up the band presents its
 *  face all the way round and the half-turns read as shading. Nearer the plane
 *  of the torus, the band turns edge-on where it twists, which is what makes
 *  the flips countable. Shared by the pole / pinch / equator panels — the three
 *  are a comparison and must be shot identically. */
export const TORUS_RIBBON: FigurePose = {
    position: [0, 2.9, 8.6],
    target: [0, 0, 0],
};

/** The domain sphere, from slightly above the equator so both a latitude ring
 *  and the north pole are legible at once. */
export const SPHERE_STANDARD: FigurePose = {
    position: [2.7, 1.9, 3.5],
    target: [0, 0, 0],
};

/** A row of fibre plates, seen face-on and flat: no perspective drama, because
 *  the figure is a comparison and any foreshortening would bias it. */
export const PLATE_ROW: FigurePose = {
    position: [0, 0.35, 5.3],
    target: [0, 0.35, 0],
};

export function applyPose(
    view: { camera: PerspectiveCamera; controls: OrbitControls },
    pose: FigurePose,
): void {
    view.camera.position.set(...pose.position);
    view.controls.target.set(...pose.target);
    view.controls.update();
}
