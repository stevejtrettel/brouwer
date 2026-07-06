/**
 * panel2d — small furniture for the flat orthographic disk panels
 * (domain view, image view): a backdrop disk, a radius-circle marker, a
 * polyline drawn from a GraphCurve's fiber coordinates, and pooled dots
 * for landmarks. All MeshBasicMaterial: these are diagrams.
 */

import {
    BufferAttribute,
    BufferGeometry,
    CircleGeometry,
    Group,
    LineLoop,
    LineBasicMaterial,
    Mesh,
    MeshBasicMaterial,
    RingGeometry,
} from "three";
import type { GraphCurve } from "../math/types.ts";
import { theme } from "./theme.ts";

/** Flat white unit disk with a charcoal rim — the range D² backdrop. */
export function makeDiskBackdrop(): Group {
    const group = new Group();
    const disk = new Mesh(
        new CircleGeometry(1, 96),
        new MeshBasicMaterial({ color: theme.slice.disk }),
    );
    const rim = new Mesh(
        new RingGeometry(0.99, 1.005, 96),
        new MeshBasicMaterial({ color: theme.slice.rim }),
    );
    rim.position.z = 0.001;
    group.add(disk, rim);
    return group;
}

/** A thin circle at radius r — marks the current slice circle on the domain. */
export class RadiusRing extends Mesh {
    constructor(color: number) {
        super(new RingGeometry(0.99, 1.01, 128), new MeshBasicMaterial({ color }));
    }

    setRadius(r: number): void {
        this.geometry.dispose();
        const w = 0.009;
        this.geometry = new RingGeometry(Math.max(r - w, 0.001), r + w, 128);
    }

    dispose(): void {
        this.geometry.dispose();
        (this.material as MeshBasicMaterial).dispose();
    }
}

/** The fiber-coordinate trace of a GraphCurve as a closed 2D polyline —
 *  e.g. the image f(S_r), the same curve whose graph is the tube in the
 *  torus view. Refit in place. */
export class DiskCurve2D extends LineLoop {
    constructor(curve: GraphCurve, color: number) {
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(new Float32Array(3 * curve.N), 3));
        super(geometry, new LineBasicMaterial({ color }));
        this.frustumCulled = false;
        this.refit(curve);
    }

    refit(curve: GraphCurve): void {
        const attr = (this.geometry as BufferGeometry).getAttribute("position") as BufferAttribute;
        const pos = attr.array as Float32Array;
        for (let i = 0; i < curve.N; i++) {
            pos[3 * i] = curve.disk[2 * i]!;
            pos[3 * i + 1] = curve.disk[2 * i + 1]!;
        }
        attr.needsUpdate = true;
    }

    dispose(): void {
        this.geometry.dispose();
        (this.material as LineBasicMaterial).dispose();
    }
}

/** A pooled landmark dot (fixed point etc.), colored by index. */
export class DiskDot extends Mesh {
    constructor(radius = 0.035) {
        super(new CircleGeometry(radius, 32), new MeshBasicMaterial({ color: theme.marker }));
        this.visible = false;
    }

    setColor(color: number): void {
        (this.material as MeshBasicMaterial).color.set(color);
    }

    dispose(): void {
        this.geometry.dispose();
        (this.material as MeshBasicMaterial).dispose();
    }
}
