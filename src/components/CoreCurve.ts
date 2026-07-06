/**
 * The core curve S¹ × {0} — mathematically just the graph of the constant
 * loop p ≡ 0, so it IS a GraphTube of the zero loop. Thin and charcoal by
 * default; its meaning shifts per proof (deformation target for Brouwer,
 * zero-vector locus for Poincaré).
 */

import { GraphTube } from "./GraphTube.ts";
import type { SolidTorus } from "../math/torus.ts";
import { sampleGraphCurve } from "../math/graphCurve.ts";
import { set2 } from "../math/types.ts";

export class CoreCurve extends GraphTube {
    constructor(torus: SolidTorus, options: { radius?: number; N?: number } = {}) {
        const curve = sampleGraphCurve(
            (_theta, out) => set2(out, 0, 0),
            options.N ?? 128,
            "core",
            "core",
        );
        super({ curve, torus, radius: options.radius ?? 0.035 });
    }
}
