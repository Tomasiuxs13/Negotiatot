import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Traces only the files the server actually needs into .next/standalone, so the
  // container ships without the full node_modules tree. Required for the VPS image.
  output: "standalone",
  experimental: {
    serverActions: {
      // Report PDFs up to 20 MB + multipart overhead
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
