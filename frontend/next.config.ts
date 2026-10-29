import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Old Indonesian slugs stayed in the URL bar after the UI moved to English.
  // Keep them working as permanent redirects so shared links do not break.
  async redirects() {
    return [
      { source: "/cara-kerja", destination: "/how-it-works", permanent: true },
      { source: "/kriteria", destination: "/rubric", permanent: true },
      { source: "/konsensus", destination: "/consensus", permanent: true },
    ];
  },
};

export default nextConfig;
