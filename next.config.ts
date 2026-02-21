import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://app.contentful.com https://app.eu.contentful.com",
          },
          { key: "X-Frame-Options", value: "" },
        ],
      },
    ]
  },
}

export default nextConfig;
