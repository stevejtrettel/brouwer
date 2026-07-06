/**
 * sphereFieldZeros — the zero census of a tangent vector field on S²,
 * i.e. Poincaré–Hopf made computational: locate every zero, compute its
 * index, and check Σ indices = χ(S²) = 2.
 *
 * Method: cover the sphere with two stereographic charts (projection from
 * the north pole covers everything but N, from the south everything but S),
 * push the field forward through each chart's differential, and run the
 * plane census (degree.ts) on a box large enough that the two chart images
 * overlap in a fat band around the equator. Zeros found in both charts are
 * merged by their 3D positions.
 *
 * The local index is chart-independent — invariant under any
 * diffeomorphism, including orientation-reversing ones (transforming the
 * base point and the vector by the same map flips the winding twice) — so
 * indices computed in either chart agree and can be summed directly.
 *
 * Chart formulas (projection from the NORTH pole; south is the mirror):
 *   σ(x,y,z) = (x, y)/(1 − z)              covers S² \ {N}, sends S → 0
 *   σ⁻¹(X,Y) = (2X, 2Y, s − 1)/(s + 1),    s = X² + Y²
 *   dσ(v)    = (vx + X·vz, vy + Y·vz)/(1 − z)
 * A search box of half-width 1.8 reaches z = (1.8² − 1)/(1.8² + 1) ≈ 0.53
 * per chart, so the union covers S² with overlap |z| ≲ 0.53.
 */

import type { Vec3 } from "../types.ts";
import { vec3 } from "../types.ts";
import type { PlaneField } from "./degree.ts";
import { findFieldZeros } from "./degree.ts";
import type { TangentVectorField } from "../maps/tangentFields.ts";

export interface SphereFieldZero {
    /** the zero on the unit sphere */
    position: Vec3;
    /** local index; null when unreliable (degenerate zero) */
    index: number | null;
    residual: number;
}

export interface SphereCensus {
    zeros: SphereFieldZero[];
    /** Σ indices — Poincaré–Hopf says 2 for any field with isolated zeros */
    indexSum: number | null;
}

const CHART_HALF_WIDTH = 1.8;

export function findSphereFieldZeros(
    field: TangentVectorField,
    time = 0,
): SphereCensus {
    const zeros: SphereFieldZero[] = [];

    for (const pole of [1, -1]) {
        // pole = +1: projection FROM the north pole (chart centered on S);
        // pole = −1: from the south (centered on N)
        const x3 = vec3();
        const v3 = vec3();
        const chartField: PlaneField = (X, Y, out) => {
            const s = X * X + Y * Y;
            const d = s + 1;
            x3.x = (2 * X) / d;
            x3.y = (2 * Y) / d;
            x3.z = (pole * (s - 1)) / d;
            field.evalTangent(x3, time, v3);
            const w = 1 / (1 - pole * x3.z);
            out.x = (v3.x + X * pole * v3.z) * w;
            out.y = (v3.y + Y * pole * v3.z) * w;
        };

        const census = findFieldZeros(
            chartField,
            {
                x0: -CHART_HALF_WIDTH,
                y0: -CHART_HALF_WIDTH,
                x1: CHART_HALF_WIDTH,
                y1: CHART_HALF_WIDTH,
            },
            { maxDepth: 11 },
        );

        for (const zero of census.zeros) {
            const s = zero.x * zero.x + zero.y * zero.y;
            const d = s + 1;
            const position = vec3((2 * zero.x) / d, (2 * zero.y) / d, (pole * (s - 1)) / d);
            const duplicate = zeros.find(
                (existing) =>
                    Math.hypot(
                        existing.position.x - position.x,
                        existing.position.y - position.y,
                        existing.position.z - position.z,
                    ) < 1e-5,
            );
            if (duplicate) continue;
            zeros.push({ position, index: zero.index, residual: zero.residual });
        }
    }

    let indexSum: number | null = 0;
    for (const zero of zeros) {
        if (zero.index === null) {
            indexSum = null;
            break;
        }
        indexSum += zero.index;
    }
    return { zeros, indexSum };
}
