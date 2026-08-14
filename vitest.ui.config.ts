import { defineConfig } from "vitest/config";

/**
 * The browser smoke suite (`npm run test:ui`). Separate from `npm test` because
 * it boots a vite dev server and drives real Chrome: ~1–2 minutes rather than
 * seconds, and it needs Chrome installed (`channel: "chrome"`, same as the old
 * drive scripts).
 *
 * It asserts only on what a visitor can actually see — the demos carry no test
 * hooks — so its reach is the rendered canvas and the kit's DOM readouts.
 */
export default defineConfig({
    test: {
        include: ["test/ui/**/*.spec.ts"],
        globalSetup: ["test/ui/server.ts"],
        // one browser, shared across specs; parallel pages would fight over GPU
        fileParallelism: false,
        testTimeout: 60_000,
        hookTimeout: 60_000,
    },
});
