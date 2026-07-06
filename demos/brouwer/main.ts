/**
 * Brouwer fixed point theorem — Phase 1 demo.
 *
 * A swirl map f: D² → D² and the identity, each restricted to the circle of
 * radius r and graphed in the solid torus. Sweep r with the slider: the two
 * tubes must collide somewhere, and the golden marker shows where — that's
 * the fixed point.
 */

import { ProofDemo } from "../../src/app/ProofDemo.ts";
import { brouwerModel } from "../../src/math/proofs/brouwer.ts";
import { swirlMap } from "../../src/math/maps/diskMaps.ts";

const f = swirlMap(0.75, 2.5, 0.25, 0.0);

new ProofDemo({
    model: brouwerModel(f),
    controls: (gui, demo) => {
        const folder = gui.addFolder("map f = swirl");
        folder.add(f.params, "a", 0, 1, 0.01).name("contraction a").onChange(() => demo.refresh());
        folder.add(f.params, "tau", -6, 6, 0.05).name("twist τ").onChange(() => demo.refresh());
        folder.add(f.params, "cx", -0.9, 0.9, 0.01).name("shift x").onChange(() => demo.refresh());
        folder.add(f.params, "cy", -0.9, 0.9, 0.01).name("shift y").onChange(() => demo.refresh());
    },
});
