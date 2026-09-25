import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        // Versioned hero cuts: immutable, served straight (no route, proxy,
        // or service worker in front) so Safari's range requests reach the file.
        source: "/hero/v1/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
    ];
  },
};

export default nextConfig;
