/**
 * LatitudeRing — the current slice circle γ_φ drawn ON the domain sphere,
 * the 3D twin of the disk panels' RadiusRing. Colored with the identity
 * role by default so "the slice is coral" reads across every demo.
 *
 * setPhi rebuilds the ring geometry (slider-rate, like RadiusRing) — the
 * circle radius is sin φ and its height cos φ, so a pure scale would also
 * scale the tube thickness.
 */

import { Mesh, TorusGeometry } from "three";
import { candyMaterial, roleColor } from "./theme.ts";

export class LatitudeRing extends Mesh {
    private readonly tube: number;

    constructor(options: { color?: number; tube?: number } = {}) {
        const tube = options.tube ?? 0.016;
        super(
            new TorusGeometry(1, tube, 10, 128),
            candyMaterial(options.color ?? roleColor("identity")),
        );
        this.tube = tube;
        this.rotation.x = Math.PI / 2; // ring around the world y-axis (poles)
        this.setPhi(Math.PI / 2);
    }

    /** Move the ring to polar angle φ ∈ (0, π). */
    setPhi(phi: number): void {
        this.geometry.dispose();
        const radius = Math.max(Math.sin(phi), 0.02);
        this.geometry = new TorusGeometry(radius, this.tube, 10, 128);
        this.position.y = Math.cos(phi);
    }

    dispose(): void {
        this.geometry.dispose();
        (this.material as ReturnType<typeof candyMaterial>).dispose();
    }
}
