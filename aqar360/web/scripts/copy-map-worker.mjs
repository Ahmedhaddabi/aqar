// Serves MapLibre's worker from our own origin (public/vendor). The library computes the worker URL at runtime,
// which the bundler cannot follow, so the map sets it explicitly (components/map/PropertyMap.tsx).
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";

const { version } = JSON.parse(readFileSync("node_modules/maplibre-gl/package.json", "utf8"));
mkdirSync("public/vendor", { recursive: true });
copyFileSync("node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", `public/vendor/maplibre-gl-worker-${version}.mjs`);
console.log(`map worker ${version} copied to public/vendor`);
