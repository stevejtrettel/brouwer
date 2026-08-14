/**
 * MeridianDisk — the fiber disk {θ} × D² shown inside the solid torus.
 *
 * The embedding at angle θ is exactly the θ = 0 disk rotated by θ about the
 * world y-axis (see torus.ts), so changing θ is a pure transform update —
 * no geometry work.
 */

import {
    CircleGeometry,
    DoubleSide,
    Group,
    Mesh,
    MeshBasicMaterial,
    MeshPhysicalMaterial,
    RingGeometry,
    TorusGeometry,
    type Material,
} from "three";
import type { SolidTorus } from "../math/torus.ts";
import { Params } from "../core/Params.ts";
import { theme } from "./theme.ts";

export class MeridianDisk extends Group {
    readonly params = new Params(this);
    declare theta: number;

    private torus: SolidTorus;
    private disk: Mesh;
    private rim: Mesh;

    constructor(
        torus: SolidTorus,
        options: { theta?: number; style?: "diagram" | "figure" } = {},
    ) {
        super();
        this.torus = torus;

        // "diagram" is the raster-preview plate (basic transparent — figure
        // mode hides it); "figure" survives the path tracer: physical
        // materials only, and a real tube rim instead of a flat ring
        const figure = options.style === "figure";
        this.disk = new Mesh(
            new CircleGeometry(1, 64),
            figure
                ? new MeshPhysicalMaterial({
                      color: theme.meridian.color,
                      transparent: true,
                      opacity: 0.3,
                      roughness: 0.5,
                      metalness: 0,
                      side: DoubleSide,
                      depthWrite: false,
                  })
                : new MeshBasicMaterial({
                      color: theme.meridian.color,
                      transparent: true,
                      opacity: theme.meridian.opacity,
                      side: DoubleSide,
                      depthWrite: false,
                  }),
        );
        this.rim = figure
            ? new Mesh(
                  new TorusGeometry(1, 0.014, 10, 96),
                  new MeshPhysicalMaterial({
                      color: theme.meridian.color,
                      roughness: 0.45,
                      metalness: 0,
                  }),
              )
            : new Mesh(
                  new RingGeometry(0.985, 1.0, 64),
                  new MeshBasicMaterial({
                      color: theme.meridian.color,
                      transparent: true,
                      opacity: Math.min(1, theme.meridian.opacity * 3),
                      side: DoubleSide,
                      depthWrite: false,
                  }),
              );
        this.disk.renderOrder = 5;
        this.rim.renderOrder = 5;
        this.add(this.disk, this.rim);

        this.params
            .define("theta", options.theta ?? 0, { triggers: "update" })
            .dependOn(torus);
        this.rebuild();
    }

    /** Reposition for the current torus dimensions (structural change). */
    rebuild(): void {
        const { R, a } = this.torus;
        for (const mesh of [this.disk, this.rim]) {
            mesh.position.set(R, 0, 0);
            mesh.scale.setScalar(a);
        }
        this.update();
    }

    /** Rotate to the current θ (cheap). */
    update(): void {
        this.rotation.y = this.theta;
    }

    dispose(): void {
        for (const mesh of [this.disk, this.rim]) {
            mesh.geometry.dispose();
            (mesh.material as Material).dispose();
        }
    }
}
