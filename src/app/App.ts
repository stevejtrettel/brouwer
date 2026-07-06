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

    private onResize(): void {
        const w = window.innerWidth;
        const h = window.innerHeight;
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
