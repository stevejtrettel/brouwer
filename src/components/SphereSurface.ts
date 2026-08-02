/**
 * SphereSurface — the domain sphere S² for Borsuk–Ulam and Poincaré:
 * a translucent shell with a light graticule so latitudes read spatially.
 *
 * Same rendering trick as TorusShell: the shell draws last (high
 * renderOrder) with depthWrite off, so rings, arrows, and markers on the far
 * side stay visible through it. The graticule sits exactly on the unit
 * sphere; the shell is fractionally inside so lines never z-fight.
 */

import {
    BufferAttribute,
    BufferGeometry,
    DoubleSide,
    Group,
    LineBasicMaterial,
    LineSegments,
    Mesh,
    MeshPhysicalMaterial,
    SphereGeometry,
} from "three";
import { theme } from "./theme.ts";

const LATITUDES = [30, 60, 90, 120, 150]; // degrees of polar angle
const MERIDIANS = 12;
const ARC_SEGMENTS = 96;

export class SphereSurface extends Group {
    private shell: Mesh;
    private graticule: LineSegments;

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

        this.graticule = new LineSegments(
            buildGraticule(),
            new LineBasicMaterial({
                color: theme.sphere.graticule,
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
        (this.graticule.material as LineBasicMaterial).dispose();
    }
}

/** Latitude circles + meridian semicircles as one LineSegments geometry.
 *  Built in world (y-up) coordinates: poles on the y-axis, matching
 *  mathToWorld ∘ spherePoint. */
function buildGraticule(): BufferGeometry {
    const points: number[] = [];
    const push = (phi: number, theta: number): void => {
        const s = Math.sin(phi);
        points.push(s * Math.cos(theta), Math.cos(phi), -s * Math.sin(theta));
    };

    for (const degrees of LATITUDES) {
        const phi = (degrees * Math.PI) / 180;
        for (let i = 0; i < ARC_SEGMENTS; i++) {
            push(phi, (2 * Math.PI * i) / ARC_SEGMENTS);
            push(phi, (2 * Math.PI * (i + 1)) / ARC_SEGMENTS);
        }
    }
    for (let m = 0; m < MERIDIANS; m++) {
        const theta = (2 * Math.PI * m) / MERIDIANS;
        for (let i = 0; i < ARC_SEGMENTS / 2; i++) {
            push((Math.PI * i) / (ARC_SEGMENTS / 2), theta);
            push((Math.PI * (i + 1)) / (ARC_SEGMENTS / 2), theta);
        }
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(new Float32Array(points), 3));
    return geometry;
}
