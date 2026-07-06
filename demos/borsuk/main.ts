/**
 * Borsuk–Ulam theorem — Phase 1 demo.
 *
 * The offset projection f(x,y,z) = clamp(x + c·z + bx, y + by), graphed
 * along the latitude φ together with its antipodal companion f̄(x) = f(−x).
 *
 * The story (non-degenerate thanks to c ≠ 0, which separates the pole
 * values): near the pole the two graphs are parallel unlinked loops near
 * f(N) and f(S) with twist 0; at the equator f̄ is the half-turn shift of f
 * and the twist is forced odd. Slide φ and watch the transition — the
 * curves must touch at some latitude, and that collision is the antipodal
 * pair f(x) = f(−x).
 */

import { ProofDemo } from "../../src/app/ProofDemo.ts";
import { borsukUlamModel, findAntipodalPair } from "../../src/math/proofs/borsukUlam.ts";
import { offsetProjection } from "../../src/math/maps/sphereMaps.ts";

const f = offsetProjection(0.35, 0.1, 0.15);

new ProofDemo({
    model: borsukUlamModel(f),
    controls: (gui, demo) => {
        const folder = gui.addFolder("map f = offset projection");
        folder.add(f.params, "c", -1, 1, 0.01).name("pole offset c").onChange(() => demo.refresh());
        folder.add(f.params, "bx", -0.5, 0.5, 0.01).name("value shift x").onChange(() => demo.refresh());
        folder.add(f.params, "by", -0.5, 0.5, 0.01).name("value shift y").onChange(() => demo.refresh());

        // the proof, run as an algorithm: bisect the twist transition in φ,
        // then Newton-trace the curves to their intersection
        gui.add(
            {
                find: () => {
                    const pair = findAntipodalPair(f);
                    if (!pair.found) {
                        demo.announce("finder did not converge — degenerate map?");
                        return;
                    }
                    demo.setState({ s: pair.phi, theta: pair.theta });
                    demo.announce(
                        `antipodal pair at x = (${pair.x.x.toFixed(3)}, ${pair.x.y.toFixed(3)}, ${pair.x.z.toFixed(3)})` +
                            `  ·  f(x) = f(−x) = (${pair.value.x.toFixed(3)}, ${pair.value.y.toFixed(3)})` +
                            `  ·  |f(x) − f(−x)| = ${pair.residual.toExponential(1)}`,
                    );
                },
            },
            "find",
        ).name("⊚ find antipodal pair");
    },
});
