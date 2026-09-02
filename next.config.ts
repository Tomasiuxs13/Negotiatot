import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Traces only the files the server actually needs into .next/standalone, so the
  // container ships without the full node_modules tree. Required for the VPS image.
  output: "standalone",
  // Left to Node's own loader rather than bundled: pdfjs ships a wasm runtime and
  // @napi-rs/canvas is a native addon, and Turbopack tracing either of them into a server
  // chunk is how a PDF upload fails at runtime with a missing-module error nobody can
  // reproduce locally.
  serverExternalPackages: ["pdf-to-img", "pdfjs-dist", "@napi-rs/canvas"],
  experimental: {
    serverActions: {
      // Report PDFs up to 20 MB + multipart overhead
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
