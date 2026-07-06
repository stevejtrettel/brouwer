/**
 * TorusShell — the semi-transparent boundary torus S¹ × ∂D².
 *
 * Rendered last (high renderOrder) with depthWrite off, so the graph tubes
 * inside stay fully visible through it.
 */

import { BufferAttribute, BufferGeometry, DoubleSide, Mesh, MeshPhysicalMaterial } from "three";
import type { SolidTorus } from "../math/torus.ts";
import { vec3 } from "../math/types.ts";
import { Params } from "../core/Params.ts";
import { theme } from "./theme.ts";

const THETA_SEGMENTS = 160;
const TUBE_SEGMENTS = 48;

export class TorusShell extends Mesh {
    readonly params = new Params(this);
    declare opacity: number;

    private torus: SolidTorus;

    constructor(torus: SolidTorus) {
        const geometry = buildShellTopology();
        const material = new MeshPhysicalMaterial({
            color: theme.torusShell.color,
            transparent: true,
            opacity: theme.torusShell.opacity,
            roughness: 0.15,
            metalness: 0,
            side: DoubleSide,
            depthWrite: false,
        });
        super(geometry, material);
        this.renderOrder = 10; // after everything opaque inside

        this.torus = torus;
        this.params
            .define("opacity", theme.torusShell.opacity, { triggers: "update" })
            .dependOn(torus);

        this.rebuild();
    }

    rebuild(): void {
        const posAttr = this.geometry.getAttribute("position") as BufferAttribute;
        const nrmAttr = this.geometry.getAttribute("normal") as BufferAttribute;
        const pos = posAttr.array as Float32Array;
        const nrm = nrmAttr.array as Float32Array;
        const p = vec3();
        for (let i = 0; i < THETA_SEGMENTS; i++) {
            const theta = (2 * Math.PI * i) / THETA_SEGMENTS;
            for (let j = 0; j < TUBE_SEGMENTS; j++) {
                const m = (2 * Math.PI * j) / TUBE_SEGMENTS;
                const u = Math.cos(m);
                const v = Math.sin(m);
                this.torus.embed(theta, u, v, p);
                const k = 3 * (i * TUBE_SEGMENTS + j);
                pos[k] = p.x;
                pos[k + 1] = p.y;
                pos[k + 2] = p.z;
                // outward normal of the boundary torus: u·e_u + v·e_v
                nrm[k] = u * Math.cos(theta);
                nrm[k + 1] = v;
                nrm[k + 2] = -u * Math.sin(theta);
            }
        }
        posAttr.needsUpdate = true;
        nrmAttr.needsUpdate = true;
        this.geometry.computeBoundingSphere();
    }

    update(): void {
        (this.material as MeshPhysicalMaterial).opacity = this.opacity;
    }

    dispose(): void {
        this.geometry.dispose();
        (this.material as MeshPhysicalMaterial).dispose();
    }
}

function buildShellTopology(): BufferGeometry {
    const geometry = new BufferGeometry();
    const count = THETA_SEGMENTS * TUBE_SEGMENTS;
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(3 * count), 3));
    geometry.setAttribute("normal", new BufferAttribute(new Float32Array(3 * count), 3));
    const index = new Uint32Array(6 * count);
    let k = 0;
    for (let i = 0; i < THETA_SEGMENTS; i++) {
        const i1 = (i + 1) % THETA_SEGMENTS;
        for (let j = 0; j < TUBE_SEGMENTS; j++) {
            const j1 = (j + 1) % TUBE_SEGMENTS;
            index[k++] = i * TUBE_SEGMENTS + j;
            index[k++] = i1 * TUBE_SEGMENTS + j;
            index[k++] = i1 * TUBE_SEGMENTS + j1;
            index[k++] = i * TUBE_SEGMENTS + j;
            index[k++] = i1 * TUBE_SEGMENTS + j1;
            index[k++] = i * TUBE_SEGMENTS + j1;
        }
    }
    geometry.setIndex(new BufferAttribute(index, 1));
    return geometry;
}
