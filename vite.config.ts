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
                borsuk: resolve(__dirname, "demos/borsuk/index.html"),
                poincare: resolve(__dirname, "demos/poincare/index.html"),
            },
        },
    },
});
