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
    ribbon: { color: 0x8d7ae0, opacity: 0.72, bandTint: 0.82 },

    /** multiplies the texture on orientation-reversed (folded-over) regions */
    foldTint: 0xd98d7e,

    /** figure mode (path tracing) — the paper look */
    paper: {
        /** the shell becomes real glass under the path tracer */
        glass: { color: 0xcfe8ee, roughness: 0.06, ior: 1.2 },
        ground: 0xffffff,
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
