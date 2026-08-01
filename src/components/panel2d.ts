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
    DoubleSide,
    Group,
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

/** The fiber-coordinate trace of a GraphCurve as a closed 2D RIBBON — e.g. the
 *  image f(S_r), the same curve whose graph is the tube in the torus view.
 *  Drawn with real width (WebGL ignores line width) by offsetting the curve
 *  ±half along its 2D normal into a closed triangle strip. Refit in place. */
export class DiskCurve2D extends Mesh {
    private readonly half: number;

    constructor(curve: GraphCurve, color: number, width = 0.02) {
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(new Float32Array(3 * 2 * curve.N), 3));
        geometry.setIndex(ribbonIndex(curve.N));
        super(geometry, new MeshBasicMaterial({ color, side: DoubleSide }));
        this.half = width / 2;
        this.frustumCulled = false;
        this.refit(curve);
    }

    refit(curve: GraphCurve): void {
        const N = curve.N;
        const d = curve.disk;
        const attr = (this.geometry as BufferGeometry).getAttribute("position") as BufferAttribute;
        const pos = attr.array as Float32Array;
        for (let i = 0; i < N; i++) {
            const prev = (i + N - 1) % N;
            const next = (i + 1) % N;
            let tx = d[2 * next]! - d[2 * prev]!;
            let ty = d[2 * next + 1]! - d[2 * prev + 1]!;
            const len = Math.hypot(tx, ty) || 1;
            tx /= len;
            ty /= len;
            const nx = -ty * this.half; // normal · half-width
            const ny = tx * this.half;
            const x = d[2 * i]!;
            const y = d[2 * i + 1]!;
            const o = 6 * i;
            pos[o] = x + nx;
            pos[o + 1] = y + ny;
            pos[o + 2] = 0;
            pos[o + 3] = x - nx;
            pos[o + 4] = y - ny;
            pos[o + 5] = 0;
        }
        attr.needsUpdate = true;
    }

    dispose(): void {
        this.geometry.dispose();
        (this.material as MeshBasicMaterial).dispose();
    }
}

/** Index buffer for a closed 2-vertex-per-station ribbon strip. */
function ribbonIndex(N: number): BufferAttribute {
    const idx = new Uint32Array(6 * N);
    let k = 0;
    for (let i = 0; i < N; i++) {
        const a = 2 * i; // outer i
        const b = 2 * i + 1; // inner i
        const c = 2 * ((i + 1) % N) + 1; // inner i+1
        const e = 2 * ((i + 1) % N); // outer i+1
        idx[k++] = a;
        idx[k++] = b;
        idx[k++] = c;
        idx[k++] = a;
        idx[k++] = c;
        idx[k++] = e;
    }
    return new BufferAttribute(idx, 1);
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
