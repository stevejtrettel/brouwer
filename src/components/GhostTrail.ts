/**
 * GhostTrail — faded snapshots of a graph curve left behind as the proof
 * parameter sweeps (roadmap Phase 4). The linking punchline needs history:
 * Γ_i shrinking to the core reads only if the eye can compare NOW with
 * BEFORE.
 *
 * A fixed pool of thin GraphTubes; snapshot() copies the source curve into
 * the next pool slot and refits that one tube (no per-frame work). Opacity
 * fades by recency.
 */

import { Group, type MeshPhysicalMaterial } from "three";
import type { GraphCurve } from "../math/types.ts";
import type { SolidTorus } from "../math/torus.ts";
import { createGraphCurve } from "../math/graphCurve.ts";
import { GraphTube } from "./GraphTube.ts";

// raster defaults: quiet enough to sit behind the live curve on screen
const OPACITY_NEWEST = 0.32;
const OPACITY_FLOOR = 0.07;

export class GhostTrail extends Group {
    private readonly source: GraphCurve;
    private readonly tubes: GraphTube[];
    private readonly curves: GraphCurve[];
    private readonly stamps: number[];
    private readonly newest: number;
    private readonly floor: number;
    private next = 0;
    private counter = 0;

    constructor(options: {
        torus: SolidTorus;
        source: GraphCurve;
        /** pool size (default 6) */
        count?: number;
        radius?: number;
        /** fade range, newest → oldest. A path-traced figure needs stronger
         *  trails than the screen does: inside the glass shell, against a
         *  bright environment, the raster defaults wash out to nothing. */
        opacity?: { newest: number; floor: number };
    }) {
        super();
        const count = options.count ?? 6;
        this.newest = options.opacity?.newest ?? OPACITY_NEWEST;
        this.floor = options.opacity?.floor ?? OPACITY_FLOOR;
        this.source = options.source;
        this.curves = Array.from({ length: count }, (_, i) =>
            createGraphCurve(options.source.N, options.source.role, `ghost-${i}`),
        );
        this.tubes = this.curves.map((curve) => {
            const tube = new GraphTube({
                curve,
                torus: options.torus,
                radius: options.radius ?? 0.04,
            });
            const material = tube.material as MeshPhysicalMaterial;
            material.transparent = true;
            material.depthWrite = false;
            tube.renderOrder = 3; // under the ribbon (4) and the shell (10)
            tube.visible = false;
            this.add(tube);
            return tube;
        });
        this.stamps = new Array<number>(count).fill(0);
    }

    /** Freeze the source curve's current shape into the next pool slot. */
    snapshot(): void {
        const slot = this.next;
        this.curves[slot]!.theta.set(this.source.theta);
        this.curves[slot]!.disk.set(this.source.disk);
        this.tubes[slot]!.refit();
        this.tubes[slot]!.visible = true;
        this.stamps[slot] = ++this.counter;
        this.next = (slot + 1) % this.tubes.length;

        // fade by recency rank
        const ranked = this.tubes
            .map((tube, i) => ({ tube, stamp: this.stamps[i]! }))
            .filter((entry) => entry.tube.visible)
            .sort((p, q) => q.stamp - p.stamp);
        for (let rank = 0; rank < ranked.length; rank++) {
            const material = ranked[rank]!.tube.material as MeshPhysicalMaterial;
            material.opacity =
                this.floor + (this.newest - this.floor) * (1 - rank / this.tubes.length);
        }
    }

    /** Hide all ghosts (a new sweep begins). */
    reset(): void {
        for (const tube of this.tubes) tube.visible = false;
        this.stamps.fill(0);
        this.next = 0;
        this.counter = 0;
    }

    dispose(): void {
        for (const tube of this.tubes) tube.dispose();
    }
}
