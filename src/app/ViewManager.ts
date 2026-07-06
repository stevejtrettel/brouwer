/**
 * ViewManager — one renderer, many viewports.
 *
 * Each viewport is a scene + camera + a rectangle in canvas fractions
 * (origin BOTTOM-LEFT, matching WebGL). render() walks them with
 * setViewport/setScissor. This keeps a single WebGL context, shares GPU
 * resources across views, and lets hi-res export capture the composed
 * layout in one readback.
 */

import {
    Color,
    OrthographicCamera,
    PerspectiveCamera,
    type Camera,
    type Scene,
    type WebGLRenderer,
} from "three";

export interface ViewRect {
    /** fractions of the canvas, origin bottom-left */
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface Viewport {
    name: string;
    scene: Scene;
    camera: Camera;
    rect: ViewRect;
    /** cleared behind this viewport; falls back to the scene background */
    background?: Color;
    /** world-units half-height for orthographic cameras */
    orthoHalfHeight?: number;
}

export class ViewManager {
    readonly viewports: Viewport[] = [];
    private width = 1;
    private height = 1;

    add(viewport: Viewport): Viewport {
        this.viewports.push(viewport);
        this.applyAspect(viewport);
        return viewport;
    }

    /** Called with the drawing-buffer size in device pixels. */
    resize(width: number, height: number): void {
        this.width = width;
        this.height = height;
        for (const vp of this.viewports) this.applyAspect(vp);
    }

    private applyAspect(vp: Viewport): void {
        const aspect = (this.width * vp.rect.w) / Math.max(1, this.height * vp.rect.h);
        if ((vp.camera as PerspectiveCamera).isPerspectiveCamera) {
            const cam = vp.camera as PerspectiveCamera;
            cam.aspect = aspect;
            cam.updateProjectionMatrix();
        } else if ((vp.camera as OrthographicCamera).isOrthographicCamera) {
            const cam = vp.camera as OrthographicCamera;
            // contain-fit: the square [-base, base]² stays visible at any aspect
            const base = vp.orthoHalfHeight ?? 1.25;
            const halfW = aspect >= 1 ? base * aspect : base;
            const halfH = aspect >= 1 ? base : base / aspect;
            cam.top = halfH;
            cam.bottom = -halfH;
            cam.left = -halfW;
            cam.right = halfW;
            cam.updateProjectionMatrix();
        }
    }

    render(renderer: WebGLRenderer): void {
        renderer.setScissorTest(true);
        for (const vp of this.viewports) {
            const x = Math.floor(vp.rect.x * this.width);
            const y = Math.floor(vp.rect.y * this.height);
            const w = Math.ceil(vp.rect.w * this.width);
            const h = Math.ceil(vp.rect.h * this.height);
            renderer.setViewport(x, y, w, h);
            renderer.setScissor(x, y, w, h);
            if (vp.background) {
                renderer.setClearColor(vp.background, 1);
                renderer.clear();
            }
            renderer.render(vp.scene, vp.camera);
        }
        renderer.setScissorTest(false);
    }

    /** Which viewport contains a pointer position (CSS pixels, top-left origin)? */
    viewportAt(cssX: number, cssY: number, cssWidth: number, cssHeight: number): Viewport | null {
        const fx = cssX / cssWidth;
        const fy = 1 - cssY / cssHeight; // flip to bottom-left origin
        for (const vp of this.viewports) {
            const { x, y, w, h } = vp.rect;
            if (fx >= x && fx <= x + w && fy >= y && fy <= y + h) return vp;
        }
        return null;
    }
}
