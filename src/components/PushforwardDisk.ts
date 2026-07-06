/**
 * PushforwardDisk — the crumpled domain: a triangulated disk whose vertices
 * are pushed through a map f, textured by DOMAIN coordinates so every point
 * stays identifiable after crumpling.
 *
 * Fold rendering is free (see diskGrid.ts): orientation-reversed triangles
 * wind clockwise, so the FrontSide material culls them and the tinted
 * BackSide material shows them — fold regions color themselves with no
 * fold-detection code here. A slightly transparent front makes multiply-
 * covered regions composite darker, so overlap reads as multiplicity.
 *
 * refit(f) is the hot path: re-push all vertices in place, no allocation.
 * (Refit with the identity map and this is the flat textured domain disk —
 * both panels use the same component.)
 */

import {
    BackSide,
    BufferAttribute,
    BufferGeometry,
    FrontSide,
    Group,
    Mesh,
    MeshBasicMaterial,
    type Texture,
} from "three";
import type { DiskGrid } from "../math/diskGrid.ts";
import { createDiskGrid, pushforwardInto } from "../math/diskGrid.ts";
import type { DiskMap } from "../math/maps/diskMaps.ts";
import { theme } from "./theme.ts";

export interface PushforwardDiskOptions {
    texture: Texture;
    grid?: DiskGrid;
    opacity?: number;
}

export class PushforwardDisk extends Group {
    readonly grid: DiskGrid;
    private geometry: BufferGeometry;
    private imagePositions: Float32Array; // 2V scratch, interleaved
    private front: Mesh;
    private back: Mesh;

    constructor(options: PushforwardDiskOptions) {
        super();
        this.grid = options.grid ?? createDiskGrid();
        const { V, domain, indices } = this.grid;

        this.geometry = new BufferGeometry();
        this.geometry.setAttribute("position", new BufferAttribute(new Float32Array(3 * V), 3));
        const uv = new Float32Array(2 * V);
        for (let i = 0; i < V; i++) {
            uv[2 * i] = (domain[2 * i]! + 1) / 2;
            uv[2 * i + 1] = (domain[2 * i + 1]! + 1) / 2;
        }
        this.geometry.setAttribute("uv", new BufferAttribute(uv, 2));
        this.geometry.setIndex(new BufferAttribute(indices, 1));

        const opacity = options.opacity ?? 1;
        this.front = new Mesh(
            this.geometry,
            new MeshBasicMaterial({
                map: options.texture,
                side: FrontSide,
                transparent: opacity < 1,
                opacity,
                depthWrite: false,
            }),
        );
        this.back = new Mesh(
            this.geometry,
            new MeshBasicMaterial({
                map: options.texture,
                color: theme.foldTint, // multiplies the texture: folds read tinted
                side: BackSide,
                transparent: opacity < 1,
                opacity,
                depthWrite: false,
            }),
        );
        this.front.frustumCulled = false;
        this.back.frustumCulled = false;
        this.back.renderOrder = 1;
        this.front.renderOrder = 2;
        this.add(this.back, this.front);

        this.imagePositions = new Float32Array(2 * V);
    }

    /** Write vertex image positions directly (2V interleaved, same grid) —
     *  the PL-map editing path, bypassing function evaluation entirely. */
    setPositions(positions: Float32Array): void {
        const attr = this.geometry.getAttribute("position") as BufferAttribute;
        const pos = attr.array as Float32Array;
        for (let i = 0; i < this.grid.V; i++) {
            pos[3 * i] = positions[2 * i]!;
            pos[3 * i + 1] = positions[2 * i + 1]!;
        }
        attr.needsUpdate = true;
    }

    /** Re-push every vertex through f. Zero allocation. */
    refit(f: DiskMap, time = 0): void {
        pushforwardInto(this.grid, f, time, this.imagePositions);
        const attr = this.geometry.getAttribute("position") as BufferAttribute;
        const pos = attr.array as Float32Array;
        for (let i = 0; i < this.grid.V; i++) {
            pos[3 * i] = this.imagePositions[2 * i]!;
            pos[3 * i + 1] = this.imagePositions[2 * i + 1]!;
        }
        attr.needsUpdate = true;
    }

    dispose(): void {
        this.geometry.dispose();
        (this.front.material as MeshBasicMaterial).dispose();
        (this.back.material as MeshBasicMaterial).dispose();
    }
}
