import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server Actions are used for mutations in the portals.
  },
};

export default nextConfig;
