/**
 * Small shared helper for the proof loop-builders (identityLoop, mapLoop,
 * latitudeGraphLoop, …): wrap a raw disk-valued closure with its role and
 * label so demos can color and name the curve.
 */

import type { DiskLoop, LabeledLoop } from "../types.ts";

/** Convenience: wrap a raw closure as a LabeledLoop. */
export function labeled(loop: DiskLoop, role: LabeledLoop["role"], label: string): LabeledLoop {
    return { loop, role, label };
}
