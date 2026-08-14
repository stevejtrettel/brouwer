/**
 * SphereSurface — the domain sphere S² for Borsuk–Ulam and Poincaré:
 * a clear glass shell with a graticule of tubes, so latitudes read spatially.
 *
 * THE GRATICULE IS GEOMETRY, NOT LINES. It used to be a LineSegments, which
 * looks right in the raster preview and then silently disappears from every
 * traced figure: three-gpu-pathtracer builds a BVH over triangles and has no
 * line primitive, so the domain sphere came out of the tracer as a bare glass
 * ball. Tubes are real triangles, take a physical material, and cast the soft
 * shadows the rest of the set is drawn with.
 *
 * It is also the better picture. Pushed through a map, this same grid is what
 * shows WHERE the sphere went — which cells stretched, which compressed, which
 * folded over. A texture smears that; geometry keeps it.
 *
 * Same rendering trick as TorusShell: the shell draws last (high renderOrder)
 * with depthWrite off, so rings, arrows, and markers on the far side stay
 * visible through it. The graticule sits exactly on the unit sphere; the shell
 * is fractionally inside so nothing z-fights.
 */

import {
    CatmullRomCurve3,
    DoubleSide,
    Group,
    Mesh,
    MeshPhysicalMaterial,
    SphereGeometry,
    TubeGeometry,
    Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { theme } from "./theme.ts";

/**
 * Grid density. Dense enough that the cells are small compared with the
 * features of a map — the whole point of drawing the grid is to see where the
 * sphere stretched and where it folded, and a coarse grid can only report that
 * something happened somewhere.
 */
export const LATITUDE_STEP = 10; // degrees of polar angle between rings
export const MERIDIAN_COUNT = 36;
/** polar angles of the latitude rings, in degrees */
export const LATITUDES = Array.from(
    { length: Math.round(180 / LATITUDE_STEP) - 1 },
    (_, i) => LATITUDE_STEP * (i + 1),
);
const ARC_SEGMENTS = 128;
/** thin enough to read as a drawn line, thick enough for the tracer to find */
const TUBE = 0.0038;
const TUBE_SIDES = 6;

/** world (y-up) point on the unit sphere — matches mathToWorld ∘ spherePoint */
function onSphere(phi: number, theta: number): Vector3 {
    const s = Math.sin(phi);
    return new Vector3(s * Math.cos(theta), Math.cos(phi), -s * Math.sin(theta));
}

export class SphereSurface extends Group {
    private shell: Mesh;
    private graticule: Mesh;

    constructor() {
        super();

        this.shell = new Mesh(
            new SphereGeometry(0.992, 64, 48),
            new MeshPhysicalMaterial({
                color: theme.sphere.color,
                transparent: true,
                opacity: theme.sphere.opacity,
                roughness: 0.15,
                metalness: 0,
                side: DoubleSide,
                depthWrite: false,
            }),
        );
        this.shell.renderOrder = 10;
        this.shell.userData.figureGlass = true; // figure mode swaps this to real glass

        this.graticule = new Mesh(
            buildGraticule(),
            new MeshPhysicalMaterial({
                color: theme.sphere.graticule,
                roughness: 0.45,
                metalness: 0,
                transparent: true,
                opacity: theme.sphere.graticuleOpacity,
            }),
        );

        this.add(this.shell, this.graticule);
    }

    dispose(): void {
        this.shell.geometry.dispose();
        (this.shell.material as MeshPhysicalMaterial).dispose();
        this.graticule.geometry.dispose();
        (this.graticule.material as MeshPhysicalMaterial).dispose();
    }
}

/** Latitude circles + meridian semicircles, every arc a tube, merged into one
 *  mesh so the whole grid is a single draw and a single BVH leaf set. */
function buildGraticule() {
    const parts = [];

    for (const degrees of LATITUDES) {
        const phi = (degrees * Math.PI) / 180;
        const points: Vector3[] = [];
        for (let i = 0; i <= ARC_SEGMENTS; i++) {
            points.push(onSphere(phi, (2 * Math.PI * i) / ARC_SEGMENTS));
        }
        parts.push(
            new TubeGeometry(new CatmullRomCurve3(points, true), ARC_SEGMENTS, TUBE, TUBE_SIDES, true),
        );
    }

    const half = ARC_SEGMENTS / 2;
    for (let m = 0; m < MERIDIAN_COUNT; m++) {
        const theta = (2 * Math.PI * m) / MERIDIAN_COUNT;
        const points: Vector3[] = [];
        // start and end a hair off the poles: every meridian meets there, and a
        // dozen tubes converging on one point is a lump, not a drawing
        for (let i = 0; i <= half; i++) {
            const t = i / half;
            points.push(onSphere(Math.PI * (0.012 + 0.976 * t), theta));
        }
        parts.push(
            new TubeGeometry(new CatmullRomCurve3(points), half, TUBE, TUBE_SIDES, false),
        );
    }

    return mergeGeometries(parts);
}
