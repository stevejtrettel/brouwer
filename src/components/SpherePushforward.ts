/**
 * SpherePushforward — the squashed balloon: a triangulated sphere whose
 * vertices are pushed through a map f: S² → D² and drawn flat in the image
 * panel, textured by SPHERE coordinates (equirect) so every point of the
 * domain stays identifiable after flattening.
 *
 * Because the grid's triangles are CCW seen from OUTSIDE, the flattened
 * northern hemisphere winds CCW (plain front material) and the southern
 * CW (fold-tinted back material) — the ≥2-fold cover is visible from frame
 * one, and sculpted folds flip further patches into the tint, exactly the
 * brouwer crumple language. A slightly transparent front composites overlap
 * darker, so multiplicity reads too.
 *
 * The geometry is NON-INDEXED (3T corners): per-corner UVs solve the θ = 0
 * seam (each triangle picks an unwrapped branch) and the pole fans (the
 * pole corner borrows its neighbors' θ). setPositions is the PL editing hot
 * path — 3T writes from the 2V position array, no allocation.
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
import type { SphereGrid } from "../math/sphereGrid.ts";
import { pushforwardSphereInto } from "../math/sphereGrid.ts";
import type { SphereDiskMap } from "../math/maps/sphereMaps.ts";
import { theme } from "./theme.ts";

export interface SpherePushforwardOptions {
    grid: SphereGrid;
    texture: Texture;
    opacity?: number;
}

export class SpherePushforward extends Group {
    readonly grid: SphereGrid;
    private geometry: BufferGeometry;
    private imagePositions: Float32Array; // 2V scratch, interleaved
    private front: Mesh;
    private back: Mesh;

    constructor(options: SpherePushforwardOptions) {
        super();
        const grid = options.grid;
        this.grid = grid;
        const corners = 3 * grid.T;

        this.geometry = new BufferGeometry();
        this.geometry.setAttribute("position", new BufferAttribute(new Float32Array(3 * corners), 3));
        this.geometry.setAttribute("uv", new BufferAttribute(buildCornerUV(grid), 2));

        const opacity = options.opacity ?? 0.85;
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
                color: theme.foldTint, // multiplies the texture: far cover reads tinted
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

        this.imagePositions = new Float32Array(2 * grid.V);
    }

    /** Write vertex image positions directly (2V interleaved, same grid) —
     *  the PL-map editing path, bypassing function evaluation entirely. */
    setPositions(positions: Float32Array): void {
        const attr = this.geometry.getAttribute("position") as BufferAttribute;
        const pos = attr.array as Float32Array;
        const idx = this.grid.indices;
        for (let c = 0; c < idx.length; c++) {
            const v = idx[c]!;
            pos[3 * c] = positions[2 * v]!;
            pos[3 * c + 1] = positions[2 * v + 1]!;
        }
        attr.needsUpdate = true;
    }

    /** Re-push every vertex through an analytic f (preset re-bake). */
    refit(f: SphereDiskMap, time = 0): void {
        pushforwardSphereInto(this.grid, f, time, this.imagePositions);
        this.setPositions(this.imagePositions);
    }

    dispose(): void {
        this.geometry.dispose();
        (this.front.material as MeshBasicMaterial).dispose();
        (this.back.material as MeshBasicMaterial).dispose();
    }
}

/** Equirect UVs per corner: u = θ/2π (seam-corrected within each triangle,
 *  may run past 1 — the texture repeats), v = 1 − φ/π; a pole corner takes
 *  the mean of its neighbors' u. */
function buildCornerUV(grid: SphereGrid): Float32Array {
    const { bands, sectors, V, indices } = grid;
    const uv = new Float32Array(2 * indices.length);

    const uOf = (i: number): number | null => {
        if (i === 0 || i === V - 1) return null; // poles: no well-defined θ
        return ((i - 1) % sectors) / sectors;
    };
    const vOf = (i: number): number => {
        if (i === 0) return 1;
        if (i === V - 1) return 0;
        const k = Math.floor((i - 1) / sectors) + 1;
        return 1 - k / bands;
    };

    const us: (number | null)[] = [null, null, null];
    for (let t = 0; t < grid.T; t++) {
        let maxU = 0;
        for (let e = 0; e < 3; e++) {
            us[e] = uOf(indices[3 * t + e]!);
            if (us[e] !== null && us[e]! > maxU) maxU = us[e]!;
        }
        // unwrap the seam: corners more than half a turn below the max are
        // on the other branch
        let sum = 0;
        let n = 0;
        for (let e = 0; e < 3; e++) {
            if (us[e] === null) continue;
            if (us[e]! < maxU - 0.5) us[e] = us[e]! + 1;
            sum += us[e]!;
            n++;
        }
        const poleU = n > 0 ? sum / n : 0;
        for (let e = 0; e < 3; e++) {
            const c = 3 * t + e;
            uv[2 * c] = us[e] ?? poleU;
            uv[2 * c + 1] = vOf(indices[c]!);
        }
    }
    return uv;
}
