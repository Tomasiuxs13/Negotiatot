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
  // Nothing in the PDF renderer can be traced, because none of it is a static import.
  // pdfjs declares @napi-rs/canvas as an OPTIONAL dependency and requires it at runtime;
  // it then loads its own worker, wasm decoders, cmaps and standard fonts by path. The
  // tracer saw two files of pdfjs and no canvas at all, so the first build of this
  // feature produced an image that started healthy and silently fell back to the "cannot
  // render" warning on every tall report — the exact failure the rendering exists to
  // remove, with nothing in the logs to say so.
  //
  // Both packages are therefore included whole. That is ~35 MB of image for the
  // guarantee that a report renders in production as it does locally; picking out
  // individual files is how the next dynamic load goes missing unnoticed. The canvas
  // glob resolves to whichever platform binary the build host installed (linux-x64-gnu
  // on the VPS, darwin-arm64 locally).
  //
  // Verify after any change here by rendering a real PDF inside the built image, not by
  // checking that the files exist — the missing worker only surfaces on a render.
  outputFileTracingIncludes: {
    "/**": ["node_modules/@napi-rs/**/*", "node_modules/pdfjs-dist/**/*"],
  },
  experimental: {
    serverActions: {
      // Report PDFs up to 20 MB + multipart overhead
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
