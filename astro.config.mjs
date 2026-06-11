// @ts-check
import { defineConfig, envField } from "astro/config";

import react from "@astrojs/react";
import sitemap from "@astrojs/sitemap";
import tailwindcss from "@tailwindcss/vite";
import cloudflare from "@astrojs/cloudflare";

// Under Astro 6 the Cloudflare adapter runs SSR inside workerd (its own Vite
// environment with its own `deps_ssr` optimizer). If the dep graph is discovered
// lazily, every late discovery re-runs optimization and reloads the worker; that
// reload lands `react` and `react-dom/server` in separate optimize passes, so the
// SSR hook dispatcher becomes null → "Cannot read properties of null (reading
// 'useState')" on any island that calls a hook. The fix is to pre-bundle the
// WHOLE island/server graph in one pass at startup so nothing is discovered late.
// See withastro/astro#16766.
//
// Keep this list in sync with the external packages imported by React islands
// (src/components/**) and the Supabase lib/middleware. `astro/env/runtime` is the
// Astro internal that was being discovered lazily here (pulled in by env.schema).
const SERVER_OPTIMIZE_DEPS = [
  "react",
  "react-dom",
  "react-dom/server.edge",
  "react-dom/client",
  "react/jsx-runtime",
  "react/jsx-dev-runtime",
  "lucide-react",
  "radix-ui",
  "@radix-ui/react-slot",
  "class-variance-authority",
  "clsx",
  "tailwind-merge",
  "@supabase/ssr",
  "@supabase/supabase-js",
  "astro/env/runtime",
];

// The same graph for the browser, so the client environment doesn't churn either.
// (No server-only entries like react-dom/server.edge or astro/env/runtime here.)
const CLIENT_OPTIMIZE_DEPS = [
  "react",
  "react-dom",
  "react-dom/client",
  "react/jsx-runtime",
  "lucide-react",
  "radix-ui",
  "@radix-ui/react-slot",
  "class-variance-authority",
  "clsx",
  "tailwind-merge",
  "@supabase/ssr",
];

// `vite.ssr.optimizeDeps` does NOT reach the Cloudflare workerd SSR environment
// (@cloudflare/vite-plugin gives it its own environment). The documented way to
// configure that environment's optimizer is the `configEnvironment` hook.
/** @returns {import("vite").Plugin} */
function optimizeServerDeps() {
  return {
    name: "optimize-server-deps",
    configEnvironment(name) {
      if (name === "client") return; // client graph is handled via vite.optimizeDeps below
      return { optimizeDeps: { include: SERVER_OPTIMIZE_DEPS } };
    },
  };
}

// https://astro.build/config
export default defineConfig({
  output: "server",
  integrations: [react(), sitemap()],
  vite: {
    plugins: [tailwindcss(), optimizeServerDeps()],
    resolve: {
      // Guarantee a single React instance across the client and workerd graphs.
      dedupe: ["react", "react-dom"],
      // Dev runs in workerd now, so force the Web-Streams ("edge") build of
      // react-dom/server everywhere — otherwise it desyncs from `react` on reload.
      alias: { "react-dom/server": "react-dom/server.edge" },
    },
    optimizeDeps: { include: CLIENT_OPTIMIZE_DEPS },
  },
  adapter: cloudflare(),
  env: {
    schema: {
      SUPABASE_URL: envField.string({ context: "server", access: "secret", optional: true }),
      SUPABASE_KEY: envField.string({ context: "server", access: "secret", optional: true }),
    },
  },
});
