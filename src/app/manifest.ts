import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Song Cards",
    short_name: "Song Cards",
    description: "Scan a card and play a favourite song.",
    start_url: "/",
    display: "standalone",
    background_color: "#fff8e8",
    theme_color: "#f5a623",
    orientation: "any",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml"
      }
    ]
  };
}
