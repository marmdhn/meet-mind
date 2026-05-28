import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Allow accessing the dev server from this LAN IP (e.g. from another device).
  // Next.js blocks cross-origin dev resources by default. Update if your IP changes.
  allowedDevOrigins: ["192.168.0.249"],
};

export default nextConfig;
