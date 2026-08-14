/**
 * FrameGizmo — the moving frame (e₁, e₂) at a point γ(θ) of a sphere loop,
 * plus the field vector v there. This is the pedagogical bridge from the
 * domain sphere to the fiber disk: the coordinates the slice inspector shows
 * are exactly (⟨v, e₁⟩, ⟨v, e₂⟩), and here are those axes, in place.
 *
 * Frame arrows are fixed-length and muted; v scales with |v| and wears its
 * role color, matching TangentArrows.
 */

import { Group, Mesh, MeshPhysicalMaterial, SphereGeometry } from "three";
import type { Vec3 } from "../math/types.ts";
import { length3 } from "../math/types.ts";
import { ArrowMesh, mathToWorld } from "./arrows.ts";
import { theme, roleColor } from "./theme.ts";

const FRAME_LENGTH = 0.42;

export class FrameGizmo extends Group {
    private readonly e1Arrow: ArrowMesh;
    private readonly e2Arrow: ArrowMesh;
    private readonly vArrow: ArrowMesh;
    private readonly dot: Mesh;

    constructor(options: { vColor?: number } = {}) {
        super();
        this.e1Arrow = new ArrowMesh(theme.frame.e1);
        this.e2Arrow = new ArrowMesh(theme.frame.e2);
        this.vArrow = new ArrowMesh(options.vColor ?? roleColor("vector-field"));
        this.dot = new Mesh(
            new SphereGeometry(0.032, 20, 14),
            new MeshPhysicalMaterial({ color: theme.roles.core, roughness: 0.4 }),
        );
        this.dot.visible = false;
        this.add(this.e1Arrow, this.e2Arrow, this.vArrow, this.dot);
    }

    /** Place the gizmo at γ(θ) (math z-up coordinates). Pass v = null to
     *  show the bare frame. */
    set(pos: Vec3, e1: Vec3, e2: Vec3, v: Vec3 | null): void {
        // demos hide the gizmo by setting `visible = false` on the group, so a
        // later set() has to turn it back on — otherwise placing the frame
        // silently does nothing, which is exactly what happened to the f_γ
        // figure (a refresh had hidden it before the preset placed it).
        this.visible = true;
        this.dot.visible = true;
        mathToWorld(pos, this.dot.position);
        this.e1Arrow.set(pos, e1, FRAME_LENGTH);
        this.e2Arrow.set(pos, e2, FRAME_LENGTH);
        if (v) {
            this.vArrow.set(pos, v, FRAME_LENGTH * length3(v));
        } else {
            this.vArrow.visible = false;
        }
    }

    dispose(): void {
        this.e1Arrow.dispose();
        this.e2Arrow.dispose();
        this.vArrow.dispose();
        this.dot.geometry.dispose();
        (this.dot.material as MeshPhysicalMaterial).dispose();
    }
}
