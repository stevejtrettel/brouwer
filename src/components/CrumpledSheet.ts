/**
 * CrumpledSheet — the crumpled image f(D²) as a REAL folded sheet.
 *
 * Drawn flat, a self-overlapping PL image is just a silhouette: the fold
 * structure only reads in raster via the FrontSide/BackSide culling trick,
 * which the path tracer punishes (winding must agree with normals). Here
 * instead each vertex carries a fold-layer count (how many creases have
 * reflected it) and gets a tiny z-lift per layer, so flaps stack like
 * actual folded paper and the tracer's soft shadows draw the creases.
 *
 * Local frame: the sheet lies in the xy-plane, lift along +z; the parent
 * group chooses tabletop/standing orientation. Constant-color matte
 * physical material — no textures, no clearcoat, real uvs — per the
 * path-tracer constraints in docs/roadmap.md.
 */

import {
    BufferAttribute,
    BufferGeometry,
    DoubleSide,
    Mesh,
    MeshPhysicalMaterial,
} from "three";
import type { DiskGrid } from "../math/diskGrid.ts";

export interface CrumpledSheetOptions {
    grid: DiskGrid;
    /** 2V interleaved image positions (a PL disk map's `positions`) */
    positions: Float32Array;
    /** V fold-layer counts (creases that have reflected each vertex) */
    layers: Float32Array;
    /** world z per fold layer (default 0.035) */
    lift?: number;
    color?: number;
}

export class CrumpledSheet extends Mesh {
    private readonly grid: DiskGrid;
    readonly lift: number;

    constructor(options: CrumpledSheetOptions) {
        const { grid } = options;
        const geometry = new BufferGeometry();
        geometry.setAttribute("position", new BufferAttribute(new Float32Array(3 * grid.V), 3));
        geometry.setAttribute("normal", new BufferAttribute(new Float32Array(3 * grid.V), 3));
        // real uvs (domain coordinates) so tracer tangent generation stays finite
        const uv = new Float32Array(2 * grid.V);
        for (let i = 0; i < grid.V; i++) {
            uv[2 * i] = (grid.domain[2 * i]! + 1) / 2;
            uv[2 * i + 1] = (grid.domain[2 * i + 1]! + 1) / 2;
        }
        geometry.setAttribute("uv", new BufferAttribute(uv, 2));
        geometry.setIndex(new BufferAttribute(grid.indices, 1));

        super(
            geometry,
            new MeshPhysicalMaterial({
                color: options.color ?? 0x9db4d8,
                roughness: 0.55,
                metalness: 0,
                side: DoubleSide,
            }),
        );
        this.grid = grid;
        this.lift = options.lift ?? 0.035;
        this.refit(options.positions, options.layers);
    }

    /** Rewrite positions (x, y, layer·lift) and recompute matching normals. */
    refit(positions: Float32Array, layers: Float32Array): void {
        const posAttr = this.geometry.getAttribute("position") as BufferAttribute;
        const pos = posAttr.array as Float32Array;
        for (let i = 0; i < this.grid.V; i++) {
            pos[3 * i] = positions[2 * i]!;
            pos[3 * i + 1] = positions[2 * i + 1]!;
            pos[3 * i + 2] = layers[i]! * this.lift;
        }
        posAttr.needsUpdate = true;
        this.geometry.computeVertexNormals(); // normals agree with winding by construction
        this.geometry.computeBoundingSphere();
    }

    dispose(): void {
        this.geometry.dispose();
        (this.material as MeshPhysicalMaterial).dispose();
    }
}
