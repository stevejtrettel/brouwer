/**
 * LoopTrail — GhostTrail's scheme on the domain sphere: the loops a homotopy
 * passed through, left behind as fading rings.
 *
 * This exists for one figure. §4's "ace out of our sleeve" — stretch γ to the
 * Tropic of Cancer, the equator, the Tropic of Capricorn, down to a small loop
 * at the south pole, then up along a longitude and over the north pole, back
 * home — is four sentences of prose describing a motion, with no picture. A
 * still can only show it as a family, so: a pool of rings, each a small circle
 * on S², faded by recency.
 *
 * Any small circle will do, not just latitudes, because LatitudeRing already
 * takes setCircle(center, α) — which is exactly what overPoleFamily produces.
 */

import { Group, type MeshPhysicalMaterial } from "three";
import type { Vec3 } from "../math/types.ts";
import { LatitudeRing } from "./LatitudeRing.ts";

// A trail on the sphere has to fight the glass shell it sits inside, so these
// run stronger than GhostTrail's screen defaults.
const OPACITY_NEWEST = 0.8;
const OPACITY_FLOOR = 0.42;
// and the rings ride just OUTSIDE the shell: coincident with it they read as
// haze rather than as curves
const LIFT = 1.012;

export class LoopTrail extends Group {
    private readonly rings: LatitudeRing[];
    private readonly stamps: number[];
    private readonly newest: number;
    private readonly floor: number;
    private next = 0;
    private counter = 0;

    constructor(
        options: {
            /** pool size (default 8) */
            count?: number;
            color?: number;
            tube?: number;
            /** fade range, newest → oldest */
            opacity?: { newest: number; floor: number };
        } = {},
    ) {
        super();
        const count = options.count ?? 8;
        this.newest = options.opacity?.newest ?? OPACITY_NEWEST;
        this.floor = options.opacity?.floor ?? OPACITY_FLOOR;
        this.rings = Array.from({ length: count }, () => {
            const ring = new LatitudeRing({
                color: options.color,
                tube: options.tube ?? 0.017, // a shade thinner than the live loop
            });
            ring.scale.setScalar(LIFT);
            const material = ring.material as MeshPhysicalMaterial;
            material.transparent = true;
            material.depthWrite = false;
            ring.visible = false;
            this.add(ring);
            return ring;
        });
        this.stamps = new Array<number>(count).fill(0);
    }

    /** Leave a ring at this small circle. */
    snapshot(center: Vec3, alpha: number): void {
        const slot = this.next;
        this.rings[slot]!.setCircle(center, alpha);
        this.rings[slot]!.visible = true;
        this.stamps[slot] = ++this.counter;
        this.next = (slot + 1) % this.rings.length;

        // fade by recency rank, exactly as GhostTrail does
        const ranked = this.rings
            .map((ring, i) => ({ ring, stamp: this.stamps[i]! }))
            .filter((entry) => entry.ring.visible)
            .sort((p, q) => q.stamp - p.stamp);
        for (let rank = 0; rank < ranked.length; rank++) {
            const material = ranked[rank]!.ring.material as MeshPhysicalMaterial;
            material.opacity =
                this.floor + (this.newest - this.floor) * (1 - rank / this.rings.length);
        }
    }

    reset(): void {
        for (const ring of this.rings) ring.visible = false;
        this.stamps.fill(0);
        this.next = 0;
        this.counter = 0;
    }

    dispose(): void {
        for (const ring of this.rings) ring.dispose();
    }
}
