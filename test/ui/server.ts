/**
 * globalSetup for the browser suite: one vite dev server for the whole run, on
 * an ephemeral port, using the project's own config (so the dev hub serves
 * /d/<name>/ exactly as `npm run dev` does). The URL reaches the specs through
 * vitest's provide/inject, which keeps this file free of node globals.
 */

import { createServer } from "vite";
import type { TestProject } from "vitest/node";

declare module "vitest" {
    interface ProvidedContext {
        demoServer: string;
    }
}

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
    // no DEMO env: the dev-hub plugin stays on, so every demo is browsable
    const server = await createServer({
        server: { port: 0, strictPort: false },
        logLevel: "warn",
    });
    await server.listen();

    const address = server.httpServer?.address();
    if (!address || typeof address === "string") throw new Error("vite did not report a port");
    project.provide("demoServer", `http://localhost:${address.port}`);

    return async () => {
        await server.close();
    };
}
