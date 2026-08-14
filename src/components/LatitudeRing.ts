/**
 * LatitudeRing — the current slice circle drawn ON the domain sphere, the
 * 3D twin of the disk panels' RadiusRing. Colored with the identity role
 * by default so "the slice is coral" reads across every demo.
 *
 * setPhi places the ring at a latitude; setCircle places it as ANY small
 * circle (center on S², angular radius) — the over-the-pole homotopy's
 * loops. Both rebuild the ring geometry (slider-rate, like RadiusRing) —
 * the circle radius is sin α, so a pure scale would also scale the tube
 * thickness.
 */

import { Mesh, TorusGeometry, Vector3 } from "three";
import type { Vec3 } from "../math/types.ts";
import { mathToWorld } from "./arrows.ts";
import { candyMaterial, roleColor } from "./theme.ts";

const LOCAL_AXIS = new Vector3(0, 0, 1); // TorusGeometry's ring axis
const worldAxis = new Vector3();

export class LatitudeRing extends Mesh {
    private readonly tube: number;

    constructor(options: { color?: number; tube?: number } = {}) {
        const tube = options.tube ?? 0.016;
        super(
            new TorusGeometry(1, tube, 10, 128),
            candyMaterial(options.color ?? roleColor("identity")),
        );
        this.tube = tube;
        this.setPhi(Math.PI / 2);
    }

    /** Move the ring to polar angle φ ∈ (0, π). */
    setPhi(phi: number): void {
        this.setCircle({ x: 0, y: 0, z: 1 }, phi);
    }

    /** Place the ring as the circle of angular radius α about `center`
     *  (a unit vector in math z-up coordinates). */
    setCircle(center: Vec3, alpha: number): void {
        this.geometry.dispose();
        const radius = Math.max(Math.sin(alpha), 0.02);
        this.geometry = new TorusGeometry(radius, this.tube, 10, 128);
        mathToWorld(center, worldAxis).normalize();
        this.quaternion.setFromUnitVectors(LOCAL_AXIS, worldAxis);
        this.position.copy(worldAxis).multiplyScalar(Math.cos(alpha));
    }

    dispose(): void {
        this.geometry.dispose();
        (this.material as ReturnType<typeof candyMaterial>).dispose();
    }
}
