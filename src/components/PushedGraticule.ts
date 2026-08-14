/**
 * PushedGraticule — the domain sphere's grid, carried through f into the disk.
 *
 * This is the picture of "the sphere crushed flat". The same latitude and
 * meridian arcs SphereSurface draws on the domain, evaluated through the map
 * and drawn as tubes in the plane: where the cells are stretched the map is
 * expanding, where they bunch it is compressing, and where the grid folds back
 * over itself the map is orientation-reversing. A textured image tells you none
 * of that — it smears the same information into a gradient.
 *
 * Tubes rather than lines for the same reason SphereSurface uses them: the
 * path tracer has no line primitive, so a line grid is invisible in every
 * traced figure while looking fine in the raster preview.
 *
 * Local frame: the disk in the xy-plane, tubes lifted a hair along +z so they
 * sit above whatever backing surface the codomain panel draws.
 */

import {
    CatmullRomCurve3,
    Group,
    Mesh,
    MeshPhysicalMaterial,
    TubeGeometry,
    Vector3,
    type BufferGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { SphereDiskMap } from "../math/maps/sphereMaps.ts";
import { spherePoint } from "../math/maps/sphereMaps.ts";
import type { Vec2, Vec3 } from "../math/types.ts";
import { vec2, vec3 } from "../math/types.ts";
import { theme } from "./theme.ts";
import { LATITUDES, MERIDIAN_COUNT } from "./SphereSurface.ts";

const ARC_SEGMENTS = 128;
const TUBE = 0.003;
const TUBE_SIDES = 6;
const LIFT = 0.004;

export interface PushedGraticuleOptions {
    /** the map to push the grid through */
    map: SphereDiskMap;
    color?: number;
    opacity?: number;
}

export class PushedGraticule extends Group {
    private mesh: Mesh;
    private map: SphereDiskMap;

    constructor(options: PushedGraticuleOptions) {
        super();
        this.map = options.map;
        this.mesh = new Mesh(
            new TubeGeometry(new CatmullRomCurve3([new Vector3(), new Vector3(0, 0, 1)]), 1, TUBE, TUBE_SIDES),
            new MeshPhysicalMaterial({
                color: options.color ?? theme.sphere.graticule,
                roughness: 0.45,
                metalness: 0,
                transparent: true,
                opacity: options.opacity ?? 0.32,
            }),
        );
        this.add(this.mesh);
        this.refit();
    }

    /** Rebuild after the map changes — a brush stroke, a preset, a loaded file. */
    refit(time = 0): void {
        const parts: BufferGeometry[] = [];
        const x: Vec3 = vec3();
        const out: Vec2 = vec2();

        const sample = (phi: number, theta: number): Vector3 => {
            spherePoint(phi, theta, x);
            this.map.evalSphere(x, time, out);
            return new Vector3(out.x, out.y, LIFT);
        };

        // Degenerate arcs are the norm here, not an error: a crushing map sends
        // whole regions to a point, and a tube through coincident points has no
        // frame. Anything shorter than this is dropped rather than drawn.
        const MIN_SPAN = 1e-4;
        const tube = (points: Vector3[], closed: boolean): void => {
            let span = 0;
            for (let i = 1; i < points.length; i++) span += points[i]!.distanceTo(points[i - 1]!);
            if (span < MIN_SPAN) return;
            parts.push(
                new TubeGeometry(
                    new CatmullRomCurve3(points, closed),
                    points.length,
                    TUBE,
                    TUBE_SIDES,
                    closed,
                ),
            );
        };

        for (const degrees of LATITUDES) {
            const phi = (degrees * Math.PI) / 180;
            const points: Vector3[] = [];
            for (let i = 0; i <= ARC_SEGMENTS; i++) {
                points.push(sample(phi, (2 * Math.PI * i) / ARC_SEGMENTS));
            }
            tube(points, true);
        }

        const half = ARC_SEGMENTS / 2;
        for (let m = 0; m < MERIDIAN_COUNT; m++) {
            const theta = (2 * Math.PI * m) / MERIDIAN_COUNT;
            const points: Vector3[] = [];
            for (let i = 0; i <= half; i++) {
                points.push(sample(Math.PI * (0.012 + 0.976 * (i / half)), theta));
            }
            tube(points, false);
        }

        this.mesh.geometry.dispose();
        this.mesh.geometry = parts.length ? mergeGeometries(parts)! : new TubeGeometry();
    }

    dispose(): void {
        this.mesh.geometry.dispose();
        (this.mesh.material as MeshPhysicalMaterial).dispose();
    }
}
