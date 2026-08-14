/**
 * The core curve S¹ × {0} — mathematically just the graph of the constant
 * loop p ≡ 0, so it IS a GraphTube of the zero loop. Its meaning shifts per
 * proof (deformation target for Brouwer, zero-vector locus for Poincaré).
 *
 * It is drawn to sit BEHIND the figure's subject: a thin matte ring in the
 * fibre-disk slate (theme.paper.core), roughly half the thickness of a graph
 * tube. It appears in nearly every torus figure and is almost never what the
 * figure is about, so weight here is weight stolen from the curves that are.
 * `emphasis: "subject"` restores some of it for the figures where the core
 * itself carries the argument — the disk it bounds, say.
 *
 * An earlier version made it smoked glass; that traced near-black (see the
 * note in theme.paper.core), which is the opposite of quiet.
 */

import type { MeshPhysicalMaterial } from "three";
import { GraphTube } from "./GraphTube.ts";
import type { SolidTorus } from "../math/torus.ts";
import { sampleGraphCurve } from "../math/graphCurve.ts";
import { set2 } from "../math/types.ts";
import { theme } from "./theme.ts";

export class CoreCurve extends GraphTube {
    constructor(
        torus: SolidTorus,
        options: {
            radius?: number;
            N?: number;
            /** "quiet" (default) sits behind the subject; "subject" is for the
             *  figures where the core carries the argument itself */
            emphasis?: "quiet" | "subject";
        } = {},
    ) {
        const curve = sampleGraphCurve(
            (_theta, out) => set2(out, 0, 0),
            options.N ?? 128,
            "core",
            "core",
        );
        // graph tubes are 0.06; the core reads as scaffolding at half that
        const subject = options.emphasis === "subject";
        super({
            curve,
            torus,
            radius: options.radius ?? (subject ? 0.042 : 0.03),
            color: theme.paper.core.color,
        });
        // matte, and less clearcoat than a subject tube: the specular highlight
        // running along a shiny ring is itself a bid for attention
        const material = this.material as MeshPhysicalMaterial;
        material.roughness = theme.paper.core.roughness;
        material.clearcoat = 0.2;
    }
}
