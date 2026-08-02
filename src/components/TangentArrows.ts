/**
 * TangentArrows — a tangent vector field on S² drawn as an instanced arrow
 * field (Poincaré domain view). One shared unit-arrow geometry; refit()
 * re-samples the field on a fixed (φ, θ) grid and rewrites only instance
 * matrices, so field-parameter sliders stay cheap.
 *
 * Arrows scale UNIFORMLY with |v| (fields are length-clamped to |v| ≤ 1):
 * vectors honestly shrink to nothing at the zeros — which is the theorem.
 */

import { DynamicDrawUsage, InstancedMesh, Matrix4, Quaternion, Vector3 } from "three";
import type { TangentVectorField } from "../math/maps/tangentFields.ts";
import { vec3 } from "../math/types.ts";
import { makeArrowGeometry, mathToWorld } from "./arrows.ts";
import { candyMaterial, roleColor } from "./theme.ts";

export interface TangentArrowsOptions {
    /** grid rings between the poles (default 13) */
    rings?: number;
    /** arrows per ring (default 26) */
    perRing?: number;
    /** world length of a unit vector's arrow (default 0.3) */
    length?: number;
    color?: number;
}

const HIDE_BELOW = 0.02; // |v| under this renders as scale 0
const LIFT = 1.01; // tails float just off the surface

const pos = new Vector3();
const dir = new Vector3();
const scale = new Vector3();
const quat = new Quaternion();
const matrix = new Matrix4();
const UP = new Vector3(0, 1, 0);
const x = vec3();
const v = vec3();

export class TangentArrows extends InstancedMesh {
    private field: TangentVectorField;
    private readonly rings: number;
    private readonly perRing: number;
    private readonly length: number;

    constructor(field: TangentVectorField, options: TangentArrowsOptions = {}) {
        const rings = options.rings ?? 13;
        const perRing = options.perRing ?? 26;
        super(
            makeArrowGeometry(),
            candyMaterial(options.color ?? roleColor("vector-field")),
            rings * perRing,
        );
        this.instanceMatrix.setUsage(DynamicDrawUsage);
        this.field = field;
        this.rings = rings;
        this.perRing = perRing;
        this.length = options.length ?? 0.3;
        this.frustumCulled = false;
        this.refit();
    }

    /** Re-sample the field into the instance matrices (field params changed). */
    refit(time = 0): void {
        let k = 0;
        for (let i = 0; i < this.rings; i++) {
            const phi = (Math.PI * (i + 0.5)) / this.rings;
            for (let j = 0; j < this.perRing; j++) {
                const theta = (2 * Math.PI * (j + 0.5 * (i % 2))) / this.perRing;
                const s = Math.sin(phi);
                x.x = s * Math.cos(theta);
                x.y = s * Math.sin(theta);
                x.z = Math.cos(phi);
                this.field.evalTangent(x, time, v);

                mathToWorld(v, dir);
                const len = dir.length();
                if (len < HIDE_BELOW) {
                    scale.setScalar(0);
                    quat.identity();
                } else {
                    dir.divideScalar(len);
                    quat.setFromUnitVectors(UP, dir);
                    scale.setScalar(this.length * len);
                }
                mathToWorld(x, pos).multiplyScalar(LIFT);
                matrix.compose(pos, quat, scale);
                this.setMatrixAt(k++, matrix);
            }
        }
        this.instanceMatrix.needsUpdate = true;
    }

    dispose(): this {
        this.geometry.dispose();
        (this.material as ReturnType<typeof candyMaterial>).dispose();
        return super.dispose();
    }
}
