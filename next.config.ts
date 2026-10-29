import type { NextConfig } from "next";

const apiMode = process.env.NEXT_PUBLIC_API_MODE ?? "demo";
if (!["demo", "service"].includes(apiMode)) throw new Error("NEXT_PUBLIC_API_MODE must be demo or service.");

const nextConfig: NextConfig = {
  output: "export",
  agentRules: false,
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
};

export default nextConfig;
