// vite.config.js
import { defineConfig } from "vite";

export default defineConfig({
    assetsInclude: ["**/*.hdr", "**/*.exr"],
    base: './',   // 👈 relative URLs, not absolute
    build: {
        target: 'esnext',
        rollupOptions: {
            output: {
                assetFileNames: (assetInfo) => {
                    return 'assets/' + assetInfo.name;
                }
            }
        }
    },
});
