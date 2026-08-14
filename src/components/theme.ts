/**
 * Visual language, all in one file.
 *
 * The look aims bright and slightly cartoonish — paper-white background,
 * saturated candy-matte tubes — so figures read cleanly in print. Swap the
 * numbers here to restyle every demo at once; nothing else in the codebase
 * hard-codes a color.
 */

import {
    Color,
    DirectionalLight,
    HemisphereLight,
    MeshPhysicalMaterial,
    type Scene,
} from "three";
import type { CurveRole } from "../math/types.ts";

export const theme = {
    /** warm paper white */
    background: 0xf7f4ee,
    /** slightly cooler tint behind the slice inspector */
    sliceBackground: 0xefede6,

    /** graph-curve colors, keyed by mathematical role */
    roles: {
        identity: 0xe4572e, //   burnt coral — the reference curve
        map: 0x2f6de1, //        vivid blue — the curve under study
        "antipodal-map": 0x8d4fd3, // violet — the companion f̄
        "vector-field": 0x0f9b8e, //  teal — Poincaré graphs
        core: 0x33313b, //       near-black charcoal
    } satisfies Record<CurveRole, number>,

    /** event highlights (fixed points, antipodal pairs, core crossings) */
    marker: 0xffb703,

    torusShell: { color: 0xa8c6d8, opacity: 0.14 },
    meridian: { color: 0x6b7a99, opacity: 0.22 },

    /** domain sphere S² (Borsuk–Ulam, Poincaré) */
    sphere: {
        color: 0xa8c6d8,
        opacity: 0.16,
        graticule: 0x6b7a99,
        graticuleOpacity: 0.3,
    },

    /** moving-frame gizmo arrows; the field vector itself uses its role color */
    frame: { e1: 0x6b7a99, e2: 0x9a9484 },

    slice: {
        disk: 0xffffff,
        rim: 0x33313b,
        segment: 0x9a9484,
    },

    /** the swept segment surface between Γ_f and Γ_f̄ (Borsuk) */
    /**
     * The swept band. NEUTRAL, deliberately: it used to be violet, which is
     * f̄'s colour, so within §3 violet meant both the companion curve and the
     * surface stretched between the two curves. A reader cannot be told that
     * colour names the object and then shown one colour naming two objects.
     *
     * The band is not a third actor — it is the thing swept BETWEEN the two
     * actors — so it takes no role colour at all. Its edges are the blue and
     * violet curves; that is what identifies it.
     */
    ribbon: {
        color: 0x9a9484,
        opacity: 0.72,
        bandTint: 0.82,
        /** Figure staging: the band's two faces are painted differently, so
         *  every half-twist FLIPS the colour the reader sees. Counting the
         *  half-twists is the whole content of §3, and a one-colour band makes
         *  it something to take on trust. Light and dark values of the SAME
         *  neutral — a second hue would read as a second object, and any role
         *  hue would collide with one of the curves. */
        faceFront: 0xded7c8,
        faceBack: 0x6f6a5e,
        /** the ℓ_θ drawn across the band as tubes — Figure 4's hatching, and
         *  what ties the surface back to the segments it is swept from */
        rung: 0x33313b,
    },

    /** multiplies the texture on orientation-reversed (folded-over) regions */
    foldTint: 0xd98d7e,

    /** figure mode (path tracing) — the paper look */
    paper: {
        /** the shell becomes real glass under the path tracer */
        glass: {
            color: 0xcfe8ee,
            roughness: 0.06,
            ior: 1.2,
            /** For figures whose subject FILLS the torus (the Borsuk band):
             *  seen at grazing angles across the whole subject, Fresnel lays a
             *  white sheen over the contents. A film, not a lens. */
            iorThin: 1.08,
        },
        /** The core curve as a quiet matte ring — the same slate the fibre disks
         *  are bounded with, so the torus's scaffolding reads as one family and
         *  the core stops competing with the curves that are the subject. */
        core: { color: 0x6b7a99, roughness: 0.45 },
        /** Concentric rings on the domain and codomain plates: the disk sliced
         *  into circles. Quiet, because they are the BACKDROP against which one
         *  highlighted circle is followed through the map. */
        rings: { color: 0x4e6480, opacity: 0.72 },
        ground: 0xffffff,
        /** Domain/codomain/slice plates. Deep enough to separate from the white
         *  ground in a traced figure — paler and they read as ghostly ellipses
         *  rather than as objects on a table. */
        plate: 0xdfd6c2,
        /** the dark rim that gives a plate its edge */
        plateRim: 0x33313b,
        /** gradient environment: bright top, warm paper below */
        environmentTop: 0xffffff,
        environmentBottom: 0xd8d2c6,
    },
} as const;

export function roleColor(role: CurveRole): number {
    return theme.roles[role];
}

/** The candy-matte look shared by tubes and markers. */
export function candyMaterial(color: number): MeshPhysicalMaterial {
    return new MeshPhysicalMaterial({
        color,
        roughness: 0.35,
        metalness: 0,
        clearcoat: 0.8,
        clearcoatRoughness: 0.3,
    });
}

/**
 * Bright, soft, shadowless three-point-ish rig — the cartoon look comes
 * from high fill ratios, not from toon shading.
 */
export function addCartoonLights(scene: Scene): void {
    const hemi = new HemisphereLight(0xffffff, 0xd8d2c6, 1.5);
    scene.add(hemi);

    const key = new DirectionalLight(0xffffff, 2.4);
    key.position.set(5, 8, 4);
    scene.add(key);

    const fill = new DirectionalLight(0xfff4e0, 1.0);
    fill.position.set(-6, 3, -5);
    scene.add(fill);

    scene.background = new Color(theme.background);
}
