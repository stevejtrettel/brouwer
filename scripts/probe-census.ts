// Probe: does the PL pipeline + census find known multi-fixed-point maps?
// And what do typical playground gestures actually produce?
import { createDiskGrid, plDiskMap, pushforwardInto } from "../src/math/diskGrid.ts";
import { findAllFixedPoints } from "../src/math/proofs/brouwer.ts";
import { swirlMap, creaseFold, foldTaking } from "../src/math/maps/diskMaps.ts";
import { vec2 } from "../src/math/types.ts";

const grid = createDiskGrid(64, 128);

function report(label: string, positions: Float32Array) {
    const sheet = plDiskMap(grid);
    sheet.positions.set(positions);
    const wrapped = {
        id: "probe", name: "probe", params: {},
        evalDisk: (x: any, t: number, out: any) => sheet.evalDisk(x, t, out),
    };
    for (const minDepth of [4, 6]) {
        const c = findAllFixedPoints(wrapped, 0, { minDepth });
        const idx = c.fixedPoints.map((p) => p.index).join(",");
        console.log(`${label} [minDepth ${minDepth}]: ${c.degenerate ? "DEGENERATE" : c.fixedPoints.length} fps, idx [${idx}], sum=${c.indexSum}`);
    }
}

// 1) known 3-fixed-point swirl, sampled INTO the PL grid (validates pipeline)
const pos = new Float32Array(2 * grid.V);
pushforwardInto(grid, swirlMap(0.85, 4.5, 0.4, 0), 0, pos);
report("swirl(0.85,4.5,0.4)", pos);

// 2) fold half over, then translate the folded area back over its origin
//    (a) drag perpendicular to the crease  (b) with a parallel component
for (const [label, tx, ty] of [["fold+perp drag", 0.5, 0], ["fold+glide drag", 0.5, 0.25]] as const) {
    const p = new Float32Array(grid.domain);
    const fold = creaseFold(foldTaking(vec2(1, 0), vec2(-0.6, 0)).t, foldTaking(vec2(1, 0), vec2(-0.6, 0)).angle);
    const v = vec2();
    for (let i = 0; i < grid.V; i++) {
        v.x = p[2 * i]!; v.y = p[2 * i + 1]!;
        fold.evalDisk(v, 0, v);
        p[2 * i] = v.x; p[2 * i + 1] = v.y;
    }
    // image-space gaussian brush centered on the folded flap, dragging (tx,ty)
    for (let i = 0; i < grid.V; i++) {
        const dx = p[2 * i]! - -0.3, dy = p[2 * i + 1]! - 0;
        const w = Math.exp(-(dx * dx + dy * dy) / (2 * 0.5 * 0.5));
        let px = p[2 * i]! + w * tx, py = p[2 * i + 1]! + w * ty;
        const r = Math.hypot(px, py);
        if (r > 1) { px /= r; py /= r; }
        p[2 * i] = px; p[2 * i + 1] = py;
    }
    report(label, p);
}

// 3) a pure big-brush drag (the most common gesture)
{
    const p = new Float32Array(grid.domain);
    for (let i = 0; i < grid.V; i++) {
        const dx = p[2 * i]! - 0.3, dy = p[2 * i + 1]!;
        const w = Math.exp(-(dx * dx + dy * dy) / (2 * 0.45 * 0.45));
        let px = p[2 * i]! - w * 0.8, py = p[2 * i + 1]! + w * 0.2;
        const r = Math.hypot(px, py);
        if (r > 1) { px /= r; py /= r; }
        p[2 * i] = px; p[2 * i + 1] = py;
    }
    report("single big drag", p);
}

// 4) twist gesture: drag top half right, bottom half left (swirl analog)
{
    const p = new Float32Array(grid.domain);
    for (const [cxs, cys, txs, tys] of [[0.1, 0.45, 0.6, -0.15], [-0.05, -0.5, -0.55, 0.1]] as const) {
        for (let i = 0; i < grid.V; i++) {
            const dx = p[2 * i]! - cxs, dy = p[2 * i + 1]! - cys;
            const w = Math.exp(-(dx * dx + dy * dy) / (2 * 0.5 * 0.5));
            let px = p[2 * i]! + w * txs, py = p[2 * i + 1]! + w * tys;
            const r = Math.hypot(px, py);
            if (r > 1) { px /= r; py /= r; }
            p[2 * i] = px; p[2 * i + 1] = py;
        }
    }
    report("twist (top→right, bottom→left)", p);
}
