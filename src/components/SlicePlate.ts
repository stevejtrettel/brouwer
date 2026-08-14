/**
 * SlicePlate — one meridian slice {θ} × D² redrawn face-on as a matte
 * plate standing beside the torus: the paper-figure cousin of the 2D
 * SliceDisk inspector. A figure highlights a slice inside the glass torus
 * and repeats it here for reference, with room for the per-slice
 * annotations the proofs use (the radial push segment for Brouwer, the
 * connecting segment ℓ_θ for Borsuk).
 *
 * Constant-hue physical materials throughout so it path-traces as-is
 * (docs/roadmap.md). Local frame: unit disk in the xy-plane facing +z;
 * scale/orient/position the group to stage it.
 */

import {
    CylinderGeometry,
    Group,
    Mesh,
    DoubleSide,
    MeshPhysicalMaterial,
    SphereGeometry,
    TorusGeometry,
} from "three";
import { theme } from "./theme.ts";

const PLATE_RADIUS = 1.04;
const PLATE_THICK = 0.03;
const TOP = PLATE_THICK / 2;
const DOT_POOL = 4;

function matte(color: number): MeshPhysicalMaterial {
    return new MeshPhysicalMaterial({ color, roughness: 0.4, metalness: 0 });
}

export interface SliceDotSpec {
    x: number;
    y: number;
    color: number;
}

export class SlicePlate extends Group {
    private readonly dots: Mesh[];
    private readonly fadedDot: Mesh;
    private readonly segment: Mesh;
    private readonly axes: Group;

    constructor() {
        super();
        // The SAME material as the fibre disk inside the torus (MeridianDisk's
        // figure style): this plate is that disk, taken out and laid flat where
        // the reader can see into it. Drawn as opaque putty it read as a
        // different object — a table the curve was resting on rather than the
        // cross-section {θ} × D² we just cut.
        const plate = new Mesh(
            new CylinderGeometry(PLATE_RADIUS, PLATE_RADIUS, PLATE_THICK, 96),
            new MeshPhysicalMaterial({
                color: theme.meridian.color,
                transparent: true,
                opacity: 0.3,
                roughness: 0.5,
                metalness: 0,
                side: DoubleSide,
                depthWrite: false,
            }),
        );
        plate.rotation.x = Math.PI / 2;

        // ∂D² and the core point — the slice's fixed landmarks
        const rim = new Mesh(new TorusGeometry(1, 0.014, 10, 96), matte(theme.slice.rim));
        rim.position.z = TOP + 0.01;
        const core = new Mesh(new SphereGeometry(0.028, 20, 12), matte(theme.slice.rim));
        core.position.z = TOP + 0.03;

        this.dots = Array.from({ length: DOT_POOL }, () => {
            const dot = new Mesh(new SphereGeometry(1, 24, 16), matte(theme.marker));
            dot.scale.setScalar(0.055);
            dot.visible = false;
            return dot;
        });
        this.fadedDot = new Mesh(new SphereGeometry(1, 24, 16), matte(0xb9b2a4));
        this.fadedDot.scale.setScalar(0.042);
        this.fadedDot.visible = false;

        this.segment = new Mesh(new CylinderGeometry(0.012, 0.012, 1, 10), matte(theme.slice.segment));
        this.segment.visible = false;

        // the plate's own axes. For Poincaré this is the whole point of the
        // construction: the tangent plane is laid on D² so that γ′ goes to
        // (1, 0), so the plate's +x IS γ′ and its +y is e₂ — something to see
        // rather than take on faith.
        this.axes = new Group();
        this.axes.visible = false;
        for (const [color, angle] of [
            [theme.frame.e1, 0],
            [theme.frame.e2, Math.PI / 2],
        ] as const) {
            const axis = new Mesh(new CylinderGeometry(0.011, 0.011, 0.86, 10), matte(color));
            axis.rotation.z = angle - Math.PI / 2; // cylinders run along +y
            axis.position.set(0.43 * Math.cos(angle), 0.43 * Math.sin(angle), TOP + 0.02);
            const tip = new Mesh(new SphereGeometry(0.026, 16, 12), matte(color));
            tip.position.set(0.86 * Math.cos(angle), 0.86 * Math.sin(angle), TOP + 0.02);
            this.axes.add(axis, tip);
        }

        this.add(plate, rim, core, this.axes, ...this.dots, this.fadedDot, this.segment);
    }

    /** Show one dot per spec (disk coordinates), hide the rest of the pool. */
    setDots(specs: SliceDotSpec[]): void {
        for (let i = 0; i < this.dots.length; i++) {
            const dot = this.dots[i]!;
            const spec = specs[i];
            dot.visible = Boolean(spec);
            if (spec) {
                (dot.material as MeshPhysicalMaterial).color.set(spec.color);
                dot.position.set(spec.x, spec.y, TOP + 0.055);
            }
        }
    }

    /** Thin segment between two disk points (e.g. the push path, or ℓ_θ).
     *  Pass `color` when the segment stands for something that is drawn in a
     *  role colour elsewhere in the figure — a grey segment beside a coloured
     *  dot reads as unrelated furniture. */
    setSegment(
        a: { x: number; y: number } | null,
        b?: { x: number; y: number },
        color?: number,
    ): void {
        if (color !== undefined) {
            (this.segment.material as MeshPhysicalMaterial).color.set(color);
        }
        if (!a || !b) {
            this.segment.visible = false;
            return;
        }
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < 1e-4) {
            this.segment.visible = false;
            return;
        }
        this.segment.visible = true;
        this.segment.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, TOP + 0.04);
        this.segment.scale.set(1, len, 1);
        this.segment.rotation.z = Math.atan2(dy, dx) - Math.PI / 2;
    }

    /** Show the plate's own frame: +x (e₁, the placed γ′) and +y (e₂). */
    setAxes(on: boolean): void {
        this.axes.visible = on;
    }

    /** A quiet gray dot marking a former position (the pre-push point). */
    setFadedDot(p: { x: number; y: number } | null): void {
        this.fadedDot.visible = Boolean(p);
        if (p) this.fadedDot.position.set(p.x, p.y, TOP + 0.045);
    }

    dispose(): void {
        this.traverse((obj) => {
            const mesh = obj as Mesh;
            if (!mesh.isMesh) return;
            mesh.geometry.dispose();
            (mesh.material as MeshPhysicalMaterial).dispose();
        });
    }
}
