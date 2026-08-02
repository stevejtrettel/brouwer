/**
 * Solid 3D arrows shared by the sphere-domain components (TangentArrows,
 * FrameGizmo). One unit arrow geometry — origin at the tail, pointing along
 * +Y, total length 1 — reused by every instance; placement is pure
 * position/quaternion/scale, so refits never rebuild geometry.
 *
 * Also home of mathToWorld: the math layer is z-up (spherePoint, tangent
 * fields); three.js is y-up. The fixed mapping (x, y, z) → (x, z, −y) is the
 * SAME convention SolidTorus.embed applies, so the sphere domain view and the
 * torus view stay rotationally aligned (θ runs the same way in both).
 */

import { BufferGeometry, ConeGeometry, CylinderGeometry, Mesh, Vector3 } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Vec3 } from "../math/types.ts";
import { candyMaterial } from "./theme.ts";

/** Map a math-layer (z-up) vector to three.js world (y-up) coordinates. */
export function mathToWorld(p: Vec3, out: Vector3): Vector3 {
    return out.set(p.x, p.z, -p.y);
}

/** The inverse: three.js world (y-up) back to math (z-up) — for picking
 *  results (SphereBrush) that must feed the math layer. */
export function worldToMath(p: Vector3, out: Vec3): Vec3 {
    out.x = p.x;
    out.y = -p.z;
    out.z = p.y;
    return out;
}

const HEAD_LENGTH = 0.32;

/** Unit arrow along +Y: shaft cylinder + cone head, tail at the origin. */
export function makeArrowGeometry(shaftRadius = 0.035, headRadius = 0.085): BufferGeometry {
    const shaft = new CylinderGeometry(shaftRadius, shaftRadius, 1 - HEAD_LENGTH, 10, 1);
    shaft.translate(0, (1 - HEAD_LENGTH) / 2, 0);
    const head = new ConeGeometry(headRadius, HEAD_LENGTH, 16);
    head.translate(0, 1 - HEAD_LENGTH / 2, 0);
    const merged = mergeGeometries([shaft, head]);
    shaft.dispose();
    head.dispose();
    return merged;
}

const UP = new Vector3(0, 1, 0);
const dirScratch = new Vector3();

/** A single posable arrow (frame gizmo axes, field vector). */
export class ArrowMesh extends Mesh {
    constructor(color: number, geometry = makeArrowGeometry()) {
        super(geometry, candyMaterial(color));
        this.visible = false;
    }

    /**
     * Place the arrow: tail at `origin`, pointing along `dir` (math z-up
     * coordinates, need not be unit), with world-space `length`. Hides
     * degenerate directions.
     */
    set(origin: Vec3, dir: Vec3, length: number): void {
        mathToWorld(dir, dirScratch);
        const len = dirScratch.length();
        if (len < 1e-6 || length < 1e-4) {
            this.visible = false;
            return;
        }
        this.visible = true;
        mathToWorld(origin, this.position);
        dirScratch.divideScalar(len);
        this.quaternion.setFromUnitVectors(UP, dirScratch);
        this.scale.set(length, length, length);
    }

    dispose(): void {
        this.geometry.dispose();
        (this.material as ReturnType<typeof candyMaterial>).dispose();
    }
}
