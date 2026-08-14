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
    /** Painted over the WHOLE canvas before the viewports are drawn. Set it
     *  when the viewports no longer cover the canvas — the figure workbench
     *  insets the figure to its true aspect, and without a matte the area
     *  around it keeps whatever the last frame left there. */
    matte: Color | null = null;
    private width = 1;
    private height = 1;

    add(viewport: Viewport): Viewport {
        this.viewports.push(viewport);
        this.applyAspect(viewport);
        return viewport;
    }

    /** Called with the canvas size in CSS pixels — NOT the drawing-buffer
     *  size. renderer.setViewport/setScissor multiply by the device pixel
     *  ratio internally, so all rect math here stays in CSS space.
     *
     *  This size is also what the pointer helpers below measure against, so
     *  they stay correct for free as the canvas resizes. NOTE: they take
     *  pointer coordinates as CANVAS-relative CSS pixels, and every caller
     *  currently passes `event.clientX/clientY` — which is the same thing
     *  only while the canvas is flush with the viewport origin. A demo that
     *  mounts into an offset container (App's `container` option) must
     *  subtract the canvas rect itself. */
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
        if (this.matte) {
            renderer.setScissorTest(false);
            renderer.setViewport(0, 0, this.width, this.height);
            renderer.setClearColor(this.matte, 1);
            renderer.clear();
        }
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

    /** Map a pointer position (CSS pixels, top-left origin) to world
     *  coordinates in an ORTHOGRAPHIC viewport. Returns false if the
     *  pointer is outside the viewport's rect. */
    pointerToWorld(
        vp: Viewport,
        cssX: number,
        cssY: number,
        out: { x: number; y: number },
    ): boolean {
        const cam = vp.camera as OrthographicCamera;
        if (!cam.isOrthographicCamera) return false;
        const fx = cssX / this.width;
        const fy = 1 - cssY / this.height;
        const lx = (fx - vp.rect.x) / vp.rect.w;
        const ly = (fy - vp.rect.y) / vp.rect.h;
        if (lx < 0 || lx > 1 || ly < 0 || ly > 1) return false;
        out.x = cam.position.x + cam.left + lx * (cam.right - cam.left);
        out.y = cam.position.y + cam.bottom + ly * (cam.top - cam.bottom);
        return true;
    }

    /** Map a pointer position (CSS pixels, top-left origin) to NDC within a
     *  viewport's rect ([-1, 1]², y up). Returns false when the pointer is
     *  outside the rect. Works for any camera — pair with a Raycaster for
     *  perspective picking (SphereBrush). */
    pointerToNDC(
        vp: Viewport,
        cssX: number,
        cssY: number,
        out: { x: number; y: number },
    ): boolean {
        const fx = cssX / this.width;
        const fy = 1 - cssY / this.height;
        const lx = (fx - vp.rect.x) / vp.rect.w;
        const ly = (fy - vp.rect.y) / vp.rect.h;
        if (lx < 0 || lx > 1 || ly < 0 || ly > 1) return false;
        out.x = 2 * lx - 1;
        out.y = 2 * ly - 1;
        return true;
    }

    /** Which viewport contains a pointer position (CSS pixels, top-left origin)? */
    viewportAt(cssX: number, cssY: number): Viewport | null {
        const fx = cssX / this.width;
        const fy = 1 - cssY / this.height; // flip to bottom-left origin
        for (const vp of this.viewports) {
            const { x, y, w, h } = vp.rect;
            if (fx >= x && fx <= x + w && fy >= y && fy <= y + h) return vp;
        }
        return null;
    }
}
