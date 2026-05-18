import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["172.16.0.44"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "http", hostname: "localhost" },
      { protocol: "https", hostname: "localhost" }
    ]
  },
  async rewrites() {
    const backendPort = process.env.NEXT_PUBLIC_API_BASE_PORT || "8001";
    return [
      {
        source: "/api/:path*",
        destination: `http://127.0.0.1:${backendPort}/api/:path*`
      },
      {
        source: "/uploads/:path*",
        destination: `http://127.0.0.1:${backendPort}/uploads/:path*`
      }
    ];
  }
};

export default nextConfig;
