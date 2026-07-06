/**
 * Borsuk–Ulam theorem — Phase 1 demo.
 *
 * A distorted projection f: S² → D², graphed along the latitude φ together
 * with its antipodal companion f̄(x) = f(−x). Slide φ from the pole to the
 * equator: near the pole the curves are separate loops near f(N) and f(S);
 * at the equator f̄ is the half-turn shift of f and the twist meter reads an
 * odd integer — the segment ribbon between them is genuinely twisted.
 */

import { ProofDemo } from "../../src/app/ProofDemo.ts";
import { borsukUlamModel } from "../../src/math/proofs/borsukUlam.ts";
import { distortedProjection } from "../../src/math/maps/sphereMaps.ts";

const f = distortedProjection(0.6);

new ProofDemo({
    model: borsukUlamModel(f),
    controls: (gui, demo) => {
        const folder = gui.addFolder("map f = distorted projection");
        folder.add(f.params, "k", -1.5, 1.5, 0.01).name("distortion k").onChange(() => demo.refresh());
    },
});
