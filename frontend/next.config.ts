import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      // Proxy all API requests to Fast API backend
      {
        source: "/api/:path*",
        destination: "http://127.0.0.1:8000/api/:path*",
      },
      // Support legacy .html page URLs
      {
        source: "/scenarios.html",
        destination: "/scenarios",
      },
      {
        source: "/analysis.html",
        destination: "/analysis",
      },
    ];
  },
};

export default nextConfig;
