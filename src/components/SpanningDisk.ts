/**
 * SpanningDisk — a disk in ℝ³ whose boundary IS the core curve, for the one
 * step of the Brouwer proof the paper argues in prose and never draws (p. 6):
 *
 *   "there is a disk in ℝ³ with the core curve as its boundary, and the
 *    (1,1)-curve pierces this disk in a single point. Counting intersections
 *    of curves with disks is in fact one way to formally define linking
 *    numbers."
 *
 * The geometry is exact rather than approximate, and it falls straight out of
 * the embedding in torus.ts — world coordinates are (ρ cos θ, a·v, −ρ sin θ),
 * so the core is the circle ρ = R lying in the y = 0 plane, and the flat disk
 * of radius R in that same plane is spanned by it. No fitting, no surface
 * solve: the disk the paper asks for is the obvious one.
 *
 * That disk meets the SOLID torus in the annulus R − a ≤ ρ ≤ R, so it emerges
 * through the inner wall and fills the hole — which is what makes the piercing
 * visible: the (1,1)-curve crosses the plane y = 0 at u = ±1, and only the
 * inner crossing (u = −1, ρ = R − a) lands on the disk.
 *
 * Opaque on purpose. A translucent membrane inside the glass shell washes out,
 * and occlusion is the depth cue that makes "passes through" legible.
 */

import { CircleGeometry, DoubleSide, Mesh, MeshPhysicalMaterial } from "three";
import type { SolidTorus } from "../math/torus.ts";
import { theme } from "./theme.ts";

export class SpanningDisk extends Mesh {
    constructor(torus: SolidTorus, options: { color?: number } = {}) {
        super(
            // CircleGeometry brings real uvs, which the tracer needs (roadmap
            // constraint #1) — a backfilled zero uv gives NaN tangents and black
            new CircleGeometry(torus.R, 128),
            new MeshPhysicalMaterial({
                // auxiliary surfaces share the plate colour, so scaffolding never
                // reads as another curve role
                color: options.color ?? theme.paper.plate,
                roughness: 0.5,
                metalness: 0,
                side: DoubleSide,
            }),
        );
        // CircleGeometry is built in the xy-plane; the core lives in y = 0
        this.rotation.x = -Math.PI / 2;
        // flat-shaded + emissive floor in figure mode, like the swept surfaces
        this.userData.figureSolid = true;
    }

    dispose(): void {
        this.geometry.dispose();
        (this.material as MeshPhysicalMaterial).dispose();
    }
}

/**
 * Where does a graph curve pierce the spanning disk? Returns the θ of every
 * crossing of the core's plane that lands INSIDE radius R — for the (1,1)-curve
 * that is exactly one, which is the whole point of the figure.
 *
 * Works on intrinsic coordinates, so it belongs to whoever owns the curve: v
 * changes sign at a crossing, and the crossing is inside the disk when
 * ρ = R + a·u < R, i.e. when u < 0.
 */
export function diskPiercings(
    curve: { N: number; theta: Float32Array; disk: Float32Array },
): number[] {
    const hits: number[] = [];
    for (let i = 0; i < curve.N; i++) {
        const j = (i + 1) % curve.N;
        const v0 = curve.disk[2 * i + 1]!;
        const v1 = curve.disk[2 * j + 1]!;
        if (v0 < 0 === v1 < 0) continue; // no crossing of the core's plane here
        // report the sample nearer the plane rather than interpolating θ, which
        // would run backwards across the θ = 2π seam
        const k = Math.abs(v0) <= Math.abs(v1) ? i : j;
        if (curve.disk[2 * k]! < 0) hits.push(curve.theta[k]!); // ρ < R: on the disk
    }
    return hits;
}
