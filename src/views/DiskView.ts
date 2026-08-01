/**
 * DiskView — a self-contained 2D disk panel a demo can drop onto the screen:
 * an orthographic viewport showing a textured PushforwardDisk, plus the
 * furniture the demos repeat (optional range-disk backdrop, radius ring, and
 * a colored dot pool for fixed points / landmarks).
 *
 * It is a VIEW, not a framework: the demo drives the disk (refit a map, or
 * setPositions from a shared mesh) and the ring/dots via the returned handles.
 * Editing is layered ON TOP by passing this view's `viewport`/`scene` (and the
 * demo's grid + sheet) to `attachSheetSculptor` — DiskView owns no sculpting.
 */

import { Color, OrthographicCamera, Scene, type Texture } from "three";

import type { App } from "../app/App.ts";
import type { ViewRect, Viewport } from "../app/ViewManager.ts";
import type { DiskGrid } from "../math/diskGrid.ts";

import { theme, roleColor } from "../components/theme.ts";
import { PushforwardDisk } from "../components/PushforwardDisk.ts";
import { makeDiskBackdrop, RadiusRing, DiskDot } from "../components/panel2d.ts";

/** One entry for the dot pool. */
export interface DiskDotSpec {
    x: number;
    y: number;
    color: number;
    visible?: boolean;
}

export interface DiskViewOptions {
    app: App;
    name: string;
    rect: ViewRect;
    texture: Texture;
    /** share a sculpt mesh so folds render exactly (image panels) */
    grid?: DiskGrid;
    /** PushforwardDisk opacity (image panels composite < 1) */
    opacity?: number;
    /** add the range-disk outline behind the disk (image panels) */
    backdrop?: boolean;
    /** add a radius ring; pass a color or true for the identity color */
    ring?: boolean | number;
    /** size of the colored dot pool (fixed points etc.) */
    dots?: number;
    dotRadius?: number;
    orthoHalfHeight?: number;
}

export interface DiskView {
    readonly scene: Scene;
    readonly viewport: Viewport;
    readonly camera: OrthographicCamera;
    readonly disk: PushforwardDisk;
    readonly ring: RadiusRing | null;
    readonly dots: DiskDot[];
    setRingRadius(r: number): void;
    /** show one dot per spec, hide the rest */
    setDots(specs: DiskDotSpec[]): void;
}

export function createDiskView(options: DiskViewOptions): DiskView {
    const { app, name, rect, texture } = options;

    const scene = new Scene();
    scene.background = new Color(theme.sliceBackground);
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    camera.position.z = 5;
    const viewport = app.views.add({
        name,
        scene,
        camera,
        rect,
        orthoHalfHeight: options.orthoHalfHeight ?? 1.15,
    });

    if (options.backdrop) scene.add(makeDiskBackdrop());

    const disk = new PushforwardDisk({ texture, grid: options.grid, opacity: options.opacity });
    disk.position.z = 0.01;
    scene.add(disk);

    let ring: RadiusRing | null = null;
    if (options.ring) {
        const color = typeof options.ring === "number" ? options.ring : roleColor("identity");
        ring = new RadiusRing(color);
        ring.position.z = 0.02;
        scene.add(ring);
    }

    const dots = Array.from({ length: options.dots ?? 0 }, () => {
        const dot = new DiskDot(options.dotRadius);
        dot.position.z = 0.03;
        scene.add(dot);
        return dot;
    });

    return {
        scene,
        viewport,
        camera,
        disk,
        ring,
        dots,
        setRingRadius(r) {
            ring?.setRadius(r);
        },
        setDots(specs) {
            for (let i = 0; i < dots.length; i++) {
                const dot = dots[i]!;
                const spec = specs[i];
                dot.visible = Boolean(spec) && spec!.visible !== false;
                if (spec) {
                    dot.setColor(spec.color);
                    dot.position.x = spec.x;
                    dot.position.y = spec.y;
                }
            }
        },
    };
}
