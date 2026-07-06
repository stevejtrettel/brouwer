/**
 * Marker — the golden highlight placed where a theorem forces an event:
 * a fixed point, an antipodal pair with equal value, or a zero of the
 * vector field. Pooled by demos: create a handful, show as needed.
 */

import { Mesh, MeshPhysicalMaterial, SphereGeometry } from "three";
import { theme } from "./theme.ts";

export class Marker extends Mesh {
    private baseRadius: number;

    constructor(radius = 0.11) {
        super(
            new SphereGeometry(1, 24, 16),
            new MeshPhysicalMaterial({
                color: theme.marker,
                emissive: theme.marker,
                emissiveIntensity: 0.55,
                roughness: 0.3,
                metalness: 0,
            }),
        );
        this.baseRadius = radius;
        this.scale.setScalar(radius);
        this.visible = false;
    }

    /** Gentle pulse so events read as live, not decals. */
    animate(time: number): void {
        if (!this.visible) return;
        this.scale.setScalar(this.baseRadius * (1 + 0.12 * Math.sin(4 * time)));
    }

    dispose(): void {
        this.geometry.dispose();
        (this.material as MeshPhysicalMaterial).dispose();
    }
}
