/**
 * A crumple: a PL disk map together with its fold-layer field, as one saved
 * thing.
 *
 * Those two arrays travel together or not at all. The positions say where the
 * sheet went; the layers say how the flaps are stacked, and that is genuinely
 * independent information — two different fold sequences can carry the disk to
 * the same image with the flaps in a different order, and nothing in the image
 * distinguishes them. So a "map" saved without its layers cannot be drawn as
 * folded paper afterwards, and anything that stores one must store the other.
 *
 * The format is deliberately dumb: the grid it was sculpted on, and two arrays
 * of fixed-point numbers. It is a checked-in asset, like a rendered figure —
 * diffable enough to see that it changed, not so precise that a rebuild churns
 * the file.
 */

import type { DiskGrid } from "../diskGrid.ts";
import type { SphereGrid } from "../sphereGrid.ts";

export interface Crumple {
    /** 2V interleaved image positions */
    positions: Float32Array;
    /** V fold-layer counts */
    layers: Float32Array;
}

interface CrumpleFile {
    format: 1;
    /** which grid this was sculpted on. "disk" files carry layers; "sphere"
     *  ones do not — a sphere map is brushed, never creased, so there are no
     *  flaps to stack. */
    kind?: "disk" | "sphere";
    rings: number;
    sectors: number;
    /** name is informational — the filename is the identity */
    name?: string;
    positions: number[];
    layers?: number[];
}

/** A sculpted S² → D² map. No layers: the sphere sculptor has no fold gesture. */
export interface SphereCrumple {
    /** 2V interleaved image coordinates in D² */
    positions: Float32Array;
}

const PLACES = 5;
const round = (x: number): number => Number(x.toFixed(PLACES));

export function serializeCrumple(grid: DiskGrid, crumple: Crumple, name?: string): string {
    const file: CrumpleFile = {
        format: 1,
        rings: grid.rings,
        sectors: grid.sectors,
        kind: "disk",
        ...(name ? { name } : {}),
        positions: Array.from(crumple.positions, round),
        layers: Array.from(crumple.layers, round),
    };
    return `${JSON.stringify(file)}\n`;
}

/**
 * Read a crumple back, checking it was sculpted on the grid we are about to
 * apply it to. A mismatch is a hard error rather than a resample: the vertex
 * indices ARE the correspondence, so a silently resampled crumple would put
 * every fold in the wrong place.
 */
export function parseCrumple(json: unknown, grid: DiskGrid): Crumple {
    const file = json as Partial<CrumpleFile>;
    if (file?.format !== 1) throw new Error("not a crumple file (format ≠ 1)");
    if (file.rings !== grid.rings || file.sectors !== grid.sectors) {
        throw new Error(
            `crumple was sculpted on a ${file.rings}×${file.sectors} grid, ` +
                `this scene uses ${grid.rings}×${grid.sectors}`,
        );
    }
    if (file.kind === "sphere") throw new Error("that file is a sphere map, not a disk map");
    if (file.positions?.length !== 2 * grid.V || file.layers?.length !== grid.V) {
        throw new Error("crumple arrays do not match the grid's vertex count");
    }
    return {
        positions: Float32Array.from(file.positions),
        layers: Float32Array.from(file.layers!),
    };
}

// ---------------------------------------------------------------- sphere
//
// Same file, same endpoint, different grid — `kind` and the dimensions are what
// stop a sphere map being applied to a disk scene or vice versa.

export function serializeSphereCrumple(
    grid: SphereGrid,
    crumple: SphereCrumple,
    name?: string,
): string {
    const file: CrumpleFile = {
        format: 1,
        kind: "sphere",
        rings: grid.bands,
        sectors: grid.sectors,
        ...(name ? { name } : {}),
        positions: Array.from(crumple.positions, round),
    };
    return `${JSON.stringify(file)}\n`;
}

export function parseSphereCrumple(json: unknown, grid: SphereGrid): SphereCrumple {
    const file = json as Partial<CrumpleFile>;
    if (file?.format !== 1) throw new Error("not a crumple file (format ≠ 1)");
    if (file.kind !== "sphere") throw new Error("that file is a disk map, not a sphere map");
    if (file.rings !== grid.bands || file.sectors !== grid.sectors) {
        throw new Error(
            `sphere map was sculpted on a ${file.rings}×${file.sectors} grid, ` +
                `this scene uses ${grid.bands}×${grid.sectors}`,
        );
    }
    if (file.positions?.length !== 2 * grid.V) {
        throw new Error("sphere map does not match the grid's vertex count");
    }
    return { positions: Float32Array.from(file.positions) };
}

export async function loadSphereCrumple(
    name: string,
    grid: SphereGrid,
): Promise<SphereCrumple | null> {
    let json: unknown;
    try {
        const res = await fetch(crumpleUrl(name));
        if (!res.ok) return null;
        json = await res.json();
    } catch {
        return null;
    }
    if (!json || (json as { missing?: boolean }).missing) return null;
    return parseSphereCrumple(json, grid);
}

export async function saveSphereCrumple(
    name: string,
    grid: SphereGrid,
    crumple: SphereCrumple,
): Promise<boolean> {
    try {
        const res = await fetch(crumpleUrl(name), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: serializeSphereCrumple(grid, crumple, name),
        });
        return res.ok;
    } catch {
        return false;
    }
}

/** Where the dev server keeps them; also the URL the lab saves to. */
export const crumpleUrl = (name: string): string => `/__crumple/${name}`;

/**
 * Fetch a saved crumple, or null if there is none (or no dev server).
 *
 * Null rather than throwing, because every scene has a scripted fallback: a
 * missing saved map should open the demo on the baked one, not break the page.
 * A crumple that EXISTS but does not fit the grid does throw — that is a real
 * mistake and silently ignoring it would be worse.
 */
export async function loadCrumple(name: string, grid: DiskGrid): Promise<Crumple | null> {
    let json: unknown;
    try {
        const res = await fetch(crumpleUrl(name));
        if (!res.ok) return null;
        json = await res.json();
    } catch {
        return null;
    }
    if (!json || (json as { missing?: boolean }).missing) return null;
    return parseCrumple(json, grid);
}

export async function saveCrumple(
    name: string,
    grid: DiskGrid,
    crumple: Crumple,
): Promise<boolean> {
    try {
        const res = await fetch(crumpleUrl(name), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: serializeCrumple(grid, crumple, name),
        });
        return res.ok;
    } catch {
        return false;
    }
}
