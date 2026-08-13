import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["rss-parser", "@privy-io/react-auth", "@privy-io/wagmi"],
  allowedDevOrigins: ["138.124.119.188", "localhost", "127.0.0.1"],
};

export default nextConfig;
