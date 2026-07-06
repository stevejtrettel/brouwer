/**
 * Poincaré / hairy-ball theorem — Phase 1 demo.
 *
 * The projected-constant field v(x) = a − ⟨a, x⟩x (zeros at ±â on the
 * equator), read along latitude loops in the moving tangent frame. Near the
 * north pole the graph is a (1,1)-curve winding once around the core; near
 * the south pole it winds −1. Slide φ through the equator and watch the
 * graph forced across the core — exactly at the zeros of the field.
 */

import { ProofDemo } from "../../src/app/ProofDemo.ts";
import { poincareModel } from "../../src/math/proofs/poincare.ts";
import { projectedConstantField } from "../../src/math/maps/tangentFields.ts";

const v = projectedConstantField(1, 0, 0);

new ProofDemo({
    model: poincareModel(v),
    epsilon: 0.05,
    controls: (gui, demo) => {
        const folder = gui.addFolder("field v = a − ⟨a,x⟩x");
        folder.add(v.params, "ax", -1, 1, 0.01).name("a·x̂").onChange(() => demo.refresh());
        folder.add(v.params, "ay", -1, 1, 0.01).name("a·ŷ").onChange(() => demo.refresh());
        folder.add(v.params, "az", -1, 1, 0.01).name("a·ẑ").onChange(() => demo.refresh());
    },
});
