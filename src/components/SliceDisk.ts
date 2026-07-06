/**
 * SliceDisk — the 2D slice inspector (math spec §6.3): one meridional disk
 * {θ} × D² drawn face-on in its own orthographic scene.
 *
 * This is the pedagogical heart: it shows WHY a graph intersection is a
 * fixed point / antipodal pair / vector-field zero. It renders:
 *   - the unit disk with rim and the core point at the center,
 *   - one dot per graph curve at the selected θ, colored by role,
 *   - the connecting segment ℓ_θ when exactly two curves are shown,
 *   - a golden event dot when an event lives at (or near) this θ.
 *
 * Everything uses MeshBasicMaterial: the inspector is a diagram, not a
 * rendered object, and must look flat and exact.
 */

import {
    CircleGeometry,
    Group,
    Mesh,
    MeshBasicMaterial,
    PlaneGeometry,
    RingGeometry,
} from "three";
import type { GraphCurve } from "../math/types.ts";
import { theme, roleColor } from "./theme.ts";

const MAX_DOTS = 8;

export class SliceDisk extends Group {
    private dots: Mesh[] = [];
    private segment: Mesh;
    private eventDot: Mesh;

    constructor() {
        super();

        const disk = new Mesh(
            new CircleGeometry(1, 96),
            new MeshBasicMaterial({ color: theme.slice.disk }),
        );
        const rim = new Mesh(
            new RingGeometry(0.99, 1.005, 96),
            new MeshBasicMaterial({ color: theme.slice.rim }),
        );
        rim.position.z = 0.001;
        const core = new Mesh(
            new CircleGeometry(0.025, 32),
            new MeshBasicMaterial({ color: theme.roles.core }),
        );
        core.position.z = 0.002;
        this.add(disk, rim, core);

        this.segment = new Mesh(
            new PlaneGeometry(1, 0.014),
            new MeshBasicMaterial({ color: theme.slice.segment }),
        );
        this.segment.position.z = 0.003;
        this.segment.visible = false;
        this.add(this.segment);

        for (let i = 0; i < MAX_DOTS; i++) {
            const dot = new Mesh(
                new CircleGeometry(0.045, 32),
                new MeshBasicMaterial({ color: 0x000000 }),
            );
            dot.position.z = 0.004;
            dot.visible = false;
            this.dots.push(dot);
            this.add(dot);
        }

        this.eventDot = new Mesh(
            new CircleGeometry(0.06, 32),
            new MeshBasicMaterial({ color: theme.marker }),
        );
        this.eventDot.position.z = 0.005;
        this.eventDot.visible = false;
        this.add(this.eventDot);
    }

    /** Show the disk points of each curve at sample index i. */
    updateSlice(curves: GraphCurve[], index: number): void {
        for (let c = 0; c < MAX_DOTS; c++) {
            const dot = this.dots[c]!;
            const curve = curves[c];
            if (!curve) {
                dot.visible = false;
                continue;
            }
            dot.visible = true;
            (dot.material as MeshBasicMaterial).color.set(roleColor(curve.role));
            dot.position.x = curve.disk[2 * index]!;
            dot.position.y = curve.disk[2 * index + 1]!;
        }

        // segment ℓ_θ between a pair of curves (Borsuk's ribbon slice; for
        // Brouwer it is the displacement f − i)
        if (curves.length === 2) {
            const [a, b] = curves as [GraphCurve, GraphCurve];
            const ax = a.disk[2 * index]!;
            const ay = a.disk[2 * index + 1]!;
            const bx = b.disk[2 * index]!;
            const by = b.disk[2 * index + 1]!;
            const len = Math.hypot(bx - ax, by - ay);
            this.segment.visible = len > 1e-4;
            this.segment.position.x = (ax + bx) / 2;
            this.segment.position.y = (ay + by) / 2;
            this.segment.rotation.z = Math.atan2(by - ay, bx - ax);
            this.segment.scale.x = len;
        } else {
            this.segment.visible = false;
        }
    }

    /** Highlight an event's disk point, or hide with null. */
    showEvent(point: { x: number; y: number } | null): void {
        if (!point) {
            this.eventDot.visible = false;
            return;
        }
        this.eventDot.visible = true;
        this.eventDot.position.x = point.x;
        this.eventDot.position.y = point.y;
    }

    dispose(): void {
        this.traverse((obj) => {
            const mesh = obj as Mesh;
            if (mesh.isMesh) {
                mesh.geometry.dispose();
                (mesh.material as MeshBasicMaterial).dispose();
            }
        });
    }
}
