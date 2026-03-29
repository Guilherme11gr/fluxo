import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Production optimizations
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  
  // Experimental features
  experimental: {
    // Enable server actions for future use
    serverActions: {
      bodySizeLimit: "2mb",
    },
  },

  // Compiler optimizations
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },

  // Environment variables validation
  env: {
    NEXT_PUBLIC_BETTER_AUTH_URL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL || process.env.BETTER_AUTH_URL || "",
    NEXT_PUBLIC_ENABLE_REALTIME: process.env.NEXT_PUBLIC_ENABLE_REALTIME || "false",
  },

  // Headers and rewrites are handled in vercel.json
};

export default nextConfig;
