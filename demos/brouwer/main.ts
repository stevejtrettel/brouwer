/**
 * Brouwer fixed point theorem — Phase 1 demo.
 *
 * A swirl map f: D² → D² and the identity, each restricted to the circle of
 * radius r and graphed in the solid torus. Sweep r with the slider: the two
 * tubes must collide somewhere, and the golden marker shows where — that's
 * the fixed point.
 */

import { ProofDemo } from "../../src/app/ProofDemo.ts";
import { brouwerModel, findBrouwerFixedPoint } from "../../src/math/proofs/brouwer.ts";
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

        // the proof, run as an algorithm: bisect the linking transition,
        // then Newton-trace the curves to their intersection
        gui.add(
            {
                find: () => {
                    const fp = findBrouwerFixedPoint(f);
                    if (!fp.found) {
                        demo.announce("finder did not converge — degenerate map?");
                        return;
                    }
                    demo.setState({ s: fp.r, theta: fp.theta });
                    demo.announce(
                        `fixed point x* = (${fp.x.x.toFixed(4)}, ${fp.x.y.toFixed(4)})` +
                            `  ·  |f(x*) − x*| = ${fp.residual.toExponential(1)}`,
                    );
                },
            },
            "find",
        ).name("⊚ find fixed point");
    },
});
