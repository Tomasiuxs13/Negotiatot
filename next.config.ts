import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // Report PDFs up to 20 MB + multipart overhead
      bodySizeLimit: "25mb",
    },
  },
};

export default nextConfig;
