import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
    assetsInclude: ["**/*.hdr", "**/*.exr"],
    base: "./", // relative URLs so builds embed in iframes / static hosting
    build: {
        target: "esnext",
        rollupOptions: {
            input: {
                index: resolve(__dirname, "index.html"),
                brouwer: resolve(__dirname, "demos/brouwer/index.html"),
                brouwerLab: resolve(__dirname, "demos/brouwer/lab.html"),
                brouwerRender: resolve(__dirname, "demos/brouwer/render.html"),
                disk: resolve(__dirname, "demos/disk/index.html"),
                diskLab: resolve(__dirname, "demos/disk/lab.html"),
                borsuk: resolve(__dirname, "demos/borsuk/index.html"),
                borsukLab: resolve(__dirname, "demos/borsuk/lab.html"),
                borsukRender: resolve(__dirname, "demos/borsuk/render.html"),
                poincare: resolve(__dirname, "demos/poincare/index.html"),
                poincareLab: resolve(__dirname, "demos/poincare/lab.html"),
                poincareRender: resolve(__dirname, "demos/poincare/render.html"),
            },
        },
    },
});
