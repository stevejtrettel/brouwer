/**
 * Linking numbers for graph curves in the solid torus (math spec §7.4).
 *
 * THE KEY FACT. Graph curves are sections of the trivial disk bundle
 * S¹ × D² → S¹. For two DISJOINT sections Γ_a, Γ_b, the linking number is
 * computable fiberwise:
 *
 *     Lk(Γ_a, Γ_b) = winding number of d(θ) = p_a(θ) − p_b(θ) around 0.
 *
 * Sketch: straight-line homotopy p_b ↝ 0 drags Γ_b to the core without ever
 * touching Γ_a IF we first divide out d — equivalently, in the trivialization
 * the pair (Γ_a, Γ_b) is isotopic to (graph of d, core), and a d-loop of
 * winding w is a (1, w)-torus curve around the core, which links it w times.
 * Constant sections (w = 0) are coaxial parallel circles: unlinked.
 *
 * For Brouwer this is the whole proof made numerical: d(θ) = f(re^{iθ}) − re^{iθ}
 * is the displacement field, so Lk(Γ_f, Γ_i) is its Poincaré–Bohl winding —
 * 0 near r = 0 (d ≈ f(0) is nearly constant) and 1 at r = 1 when f has no
 * boundary fixed point (d can never point radially outward, so it is
 * homotopic to −x). The forced 0 → 1 jump is the fixed point.
 *
 * SIGN CONVENTION. We orient by the fiber disk: Lk = +1 for the eastward
 * (1,1)-curve around the core, matching the winding/twist meters and the
 * paper's narrative. Our particular y-up embedding (torus.ts) is a
 * LEFT-handed (θ, u, v) frame, so the extrinsic right-handed Gauss linking
 * number of the embedded curves is the NEGATIVE of this value — pinned by a
 * unit test cross-checking against gaussLinkingNumber below.
 *
 * RELIABILITY. The winding is only defined for disjoint curves, and only
 * trustworthy when adequately sampled. linkingNumber() returns lk = null
 * (rather than a garbage integer) when the curves come within
 * `minSeparation` at some sampled θ, or when the computed winding is not
 * near an integer (the undersampling signature).
 */

import type { GraphCurve, Vec3 } from "../types.ts";
import { vec3 } from "../types.ts";
import type { SolidTorus } from "../torus.ts";
import { relativeWinding } from "./winding.ts";
import { closestApproach } from "./collisions.ts";

export interface LinkingResult {
    /** the integer linking number, or null when undefined/unreliable */
    lk: number | null;
    /** minimum same-θ distance between the curves */
    separation: number;
    /** the raw (unrounded) fiber winding, for diagnostics */
    raw: number;
}

/** How close the raw winding must be to an integer to be trusted. */
const INTEGRALITY_TOL = 0.05;

/**
 * Linking number of two graph curves via the fiberwise winding of their
 * difference. O(N); cheap enough for every refresh.
 */
export function linkingNumber(
    a: GraphCurve,
    b: GraphCurve,
    minSeparation = 1e-3,
): LinkingResult {
    const separation = closestApproach(a, b).distance;
    const raw = relativeWinding(a, b);
    if (separation < minSeparation) return { lk: null, separation, raw };
    const rounded = Math.round(raw);
    if (Math.abs(raw - rounded) > INTEGRALITY_TOL) return { lk: null, separation, raw };
    return { lk: rounded, separation, raw };
}

/**
 * The Gauss linking integral over the EMBEDDED curves:
 *
 *     Lk = (1/4π) ∮∮ (r₁ − r₂) · (dr₁ × dr₂) / |r₁ − r₂|³
 *
 * evaluated by the midpoint rule on polygonal approximations. O(N²) — this
 * is a validator and test oracle, not a per-frame meter. Returns the
 * right-handed ℝ³ linking number, which for our embedding is −(fiber
 * winding); see the header.
 */
export function gaussLinkingNumber(
    a: GraphCurve,
    b: GraphCurve,
    torus: SolidTorus,
    maxSamples = 256,
): number {
    const pa = embedPolygon(a, torus, maxSamples);
    const pb = embedPolygon(b, torus, maxSamples);
    const na = pa.length / 3;
    const nb = pb.length / 3;

    let total = 0;
    for (let i = 0; i < na; i++) {
        const i1 = (i + 1) % na;
        midpointAndEdge(pa, i, i1, m1, d1);
        for (let j = 0; j < nb; j++) {
            const j1 = (j + 1) % nb;
            midpointAndEdge(pb, j, j1, m2, d2);
            const rx = m1.x - m2.x;
            const ry = m1.y - m2.y;
            const rz = m1.z - m2.z;
            const dist = Math.hypot(rx, ry, rz);
            // triple product (r₁ − r₂) · (dr₁ × dr₂)
            const cx = d1.y * d2.z - d1.z * d2.y;
            const cy = d1.z * d2.x - d1.x * d2.z;
            const cz = d1.x * d2.y - d1.y * d2.x;
            total += (rx * cx + ry * cy + rz * cz) / (dist * dist * dist);
        }
    }
    return total / (4 * Math.PI);
}

function embedPolygon(curve: GraphCurve, torus: SolidTorus, maxSamples: number): Float64Array {
    const stride = Math.max(1, Math.floor(curve.N / maxSamples));
    const n = Math.floor(curve.N / stride);
    const out = new Float64Array(3 * n);
    const p = vec3();
    for (let k = 0; k < n; k++) {
        const i = k * stride;
        torus.embed(curve.theta[i]!, curve.disk[2 * i]!, curve.disk[2 * i + 1]!, p);
        out[3 * k] = p.x;
        out[3 * k + 1] = p.y;
        out[3 * k + 2] = p.z;
    }
    return out;
}

function midpointAndEdge(poly: Float64Array, i: number, i1: number, mid: Vec3, edge: Vec3): void {
    mid.x = (poly[3 * i]! + poly[3 * i1]!) / 2;
    mid.y = (poly[3 * i + 1]! + poly[3 * i1 + 1]!) / 2;
    mid.z = (poly[3 * i + 2]! + poly[3 * i1 + 2]!) / 2;
    edge.x = poly[3 * i1]! - poly[3 * i]!;
    edge.y = poly[3 * i1 + 1]! - poly[3 * i + 1]!;
    edge.z = poly[3 * i1 + 2]! - poly[3 * i + 2]!;
}

const m1 = vec3();
const m2 = vec3();
const d1 = vec3();
const d2 = vec3();
