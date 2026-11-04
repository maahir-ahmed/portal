import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Don't advertise the framework (and so which advisories apply) on every response.
  poweredByHeader: false,
  // Headers that change nothing a user sees: no MIME sniffing of anything we serve, and
  // only the origin (not the path, which can carry a request id) in the Referer sent
  // to other sites. Framing is left alone: see the audit report's proposals.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // No other site may frame the portal, so its buttons can't be laid under a
          // decoy page and clicked through (clickjacking). Nothing embeds it.
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
        ],
      },
    ];
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
