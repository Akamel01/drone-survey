import type { MetadataRoute } from "next";

// What makes the planner installable (PWA-1, #313): Chrome's Install and
// Safari's Add to Home Screen. Colours are the theme's `--canopy-900`
// (docs/ui-theme/spec.md); the icons are rendered by scripts/make-icons.mjs.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/plan",
    name: "Mission Control",
    short_name: "Mission Control",
    description: "Drone survey mission planner",
    start_url: "/plan",
    scope: "/",
    display: "standalone",
    background_color: "#0A0E0F",
    theme_color: "#0A0E0F",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
