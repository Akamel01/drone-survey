// Basemap styles for MapLibre. Swap the map's active style by pointing at
// BASEMAP or BASEMAP_OSM — both are plain style objects, no access token.
import type { StyleSpecification } from "maplibre-gl";

export const BASEMAP: StyleSpecification = {
  version: 8,
  sources: {
    esri: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution: "Imagery © Esri",
    },
  },
  layers: [{ id: "esri", type: "raster", source: "esri" }],
};

export const BASEMAP_OSM: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 19,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};
