/**
 * ProofModel — the interface each theorem implements. A model is a thin
 * configuration over the shared engine: it says which disk-valued loops
 * exist at each value of the proof parameter, and what "forced event" to
 * look for. Demos own sampling, rendering, and UI; models own only math.
 */

import type { DiskLoop, GraphCurve, LabeledLoop, Vec2 } from "../types.ts";

export type ProofEventKind = "fixed-point" | "antipodal-pair" | "core-crossing";

export interface ProofEvent {
    kind: ProofEventKind;
    /** sample index and θ where the event occurs */
    index: number;
    theta: number;
    /** the detector residual — |f − i|, |f(x) − f(−x)|, or |p| */
    error: number;
    /** the shared disk point (midpoint of the near-collision) */
    disk: Vec2;
}

export interface MeterReading {
    name: string;
    value: number;
    /** optional pre-formatted display string */
    display?: string;
}

export interface ProofModel {
    id: string;
    title: string;
    /** display name of the proof parameter: 'r', 'φ', 't' */
    paramName: string;
    paramRange: [number, number];
    /** a sensible starting value for demos */
    paramDefault: number;
    /** the disk-valued loops at parameter s, in draw order */
    loopsAt(s: number): LabeledLoop[];
    /**
     * Detect forced events on the sampled curves (same order as loopsAt).
     * Illustrative, not a proof engine: ε-closeness at the sample grid.
     */
    detect(s: number, curves: GraphCurve[], epsilon: number): ProofEvent[];
    /** live numerical meters (twist, winding, min-error) */
    meters(curves: GraphCurve[]): MeterReading[];
    /**
     * A one-line topological status shown prominently in the overlay,
     * e.g. "linked · Lk = 1". Optional.
     */
    status?(curves: GraphCurve[]): string;
}

/** Convenience: wrap a raw closure as a LabeledLoop. */
export function labeled(
    loop: DiskLoop,
    role: LabeledLoop["role"],
    label: string,
): LabeledLoop {
    return { loop, role, label };
}
