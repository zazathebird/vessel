import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    /*
     * `/api/*` goes to the Worker, so `npm run dev` and `npm run dev:worker`
     * running together give one origin that has both.
     *
     * **This is what makes an API-backed page reviewable at the phone band.**
     * `docs`/the verify-site skill reach a band by framing `sitelab.html`, and
     * framing only works against Vite — production and `wrangler dev` both send
     * `x-frame-options: DENY` from `harden()`. So before this, any page that
     * fetches (the account pages, `/machines`, `/share`, and now `/downloads`)
     * could be seen at desk width or not at all, and the phone band was checked
     * by reading CSS and hoping.
     *
     * Dev-server only, and there is nothing to leak: `vite build` never reads
     * `server`, the Worker in production serves the same origin for real, and
     * `configure` narrows the failure so a Worker that is not running says so
     * instead of hanging the page.
     */
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8787",
        changeOrigin: false,
        configure: (proxy) => {
          proxy.on("error", () => {
            // Not thrown: a missing Worker is the ordinary state of `npm run
            // dev`, and a crashed dev server is a worse answer than a page that
            // degrades. §11 — everything degrades.
            console.warn("[vite] /api proxy: no Worker on 127.0.0.1:8787 — run `npm run dev:worker`");
          });
        },
      },
    },
  },
});
