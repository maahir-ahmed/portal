import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // With a proxy in place Next buffers every request body, and past this limit
    // (10MB by default) it passes on only the first part, with no error. Uploads go up
    // to MAX_FILE_SIZE_MB, and restore chunks are sized under this, so it matches
    // nginx's client_max_body_size instead.
    proxyClientMaxBodySize: "25mb",
  },
};

export default nextConfig;
