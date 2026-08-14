/**
 * App — the minimal shell: renderer, canvas, clock, resize, animation loop.
 * Everything scene-specific lives in the demos; App just runs the machine.
 */

import {
    ACESFilmicToneMapping,
    Clock,
    PMREMGenerator,
    SRGBColorSpace,
    WebGLRenderer,
    type Scene,
    type Texture,
} from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { ViewManager } from "./ViewManager.ts";

export type AnimateCallback = (time: number, delta: number) => void;

export class App {
    readonly renderer: WebGLRenderer;
    readonly views = new ViewManager();

    private clock = new Clock();
    private callbacks: AnimateCallback[] = [];
    private environmentTexture: Texture | null = null;
    private frame: { width: number; height: number } | null = null;

    constructor(options: { container?: HTMLElement } = {}) {
        this.renderer = new WebGLRenderer({
            antialias: true,
            preserveDrawingBuffer: true, // for PNG export
        });
        this.renderer.toneMapping = ACESFilmicToneMapping;
        this.renderer.outputColorSpace = SRGBColorSpace;
        (options.container ?? document.body).appendChild(this.renderer.domElement);

        window.addEventListener("resize", () => this.onResize());
        this.onResize();
    }

    /** Soft studio environment for PBR highlights — no HDR asset needed. */
    applyEnvironment(scene: Scene, intensity = 0.65): void {
        if (!this.environmentTexture) {
            const pmrem = new PMREMGenerator(this.renderer);
            this.environmentTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        }
        scene.environment = this.environmentTexture;
        scene.environmentIntensity = intensity;
    }

    addAnimateCallback(fn: AnimateCallback): void {
        this.callbacks.push(fn);
    }

    start(): void {
        this.renderer.setAnimationLoop(() => {
            const delta = this.clock.getDelta();
            const time = this.clock.elapsedTime;
            for (const fn of this.callbacks) fn(time, delta);
            this.views.render(this.renderer);
        });
    }

    /** Halt the raster loop (figure mode takes over the canvas). */
    stop(): void {
        this.renderer.setAnimationLoop(null);
    }

    /**
     * Pin the canvas to an exact CSS size, centred in the window, instead of
     * filling it. Figure mode uses this so that what gets traced — and saved —
     * is the figure's own aspect rather than whatever shape the browser window
     * happens to be. Pass null to go back to filling the window.
     *
     * While framed the canvas is NO LONGER flush with the viewport origin, so
     * the pointer helpers in ViewManager (which take client coordinates) are
     * off by the canvas offset. That is fine for figure mode, where only
     * OrbitControls is live and it works in deltas — but do not frame the
     * canvas while sculpting or combing is reachable.
     */
    setFrame(frame: { width: number; height: number } | null): void {
        this.frame = frame;
        const el = this.renderer.domElement;
        Object.assign(el.style, {
            position: frame ? "fixed" : "",
            left: frame ? "50%" : "",
            top: frame ? "50%" : "",
            transform: frame ? "translate(-50%, -50%)" : "",
        });
        this.onResize();
    }

    private onResize(): void {
        const w = this.frame?.width ?? window.innerWidth;
        const h = this.frame?.height ?? window.innerHeight;
        this.renderer.setPixelRatio(window.devicePixelRatio || 1);
        this.renderer.setSize(w, h);
        // CSS pixels: setViewport/setScissor apply the pixel ratio themselves
        this.views.resize(w, h);
    }

    /** Render the composed layout at `scale`× and download it as a PNG. */
    exportPNG(name = "figure", scale = 2): void {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const pixelRatio = this.renderer.getPixelRatio();

        this.renderer.setPixelRatio(1);
        this.renderer.setSize(w * scale, h * scale, false);
        this.views.resize(w * scale, h * scale);
        this.views.render(this.renderer);

        const link = document.createElement("a");
        link.download = `${name}.png`;
        link.href = this.renderer.domElement.toDataURL("image/png");
        link.click();

        this.renderer.setPixelRatio(pixelRatio);
        this.renderer.setSize(w, h);
        this.views.resize(w, h);
    }
}
