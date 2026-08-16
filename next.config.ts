import type { NextConfig } from "next";

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://vitals.vercel-insights.com https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.polymarket.com https://polymarket.com https://*.googleusercontent.com https://*.amazonaws.com https://*.cloudfront.net https://*.privy.io https://*.walletconnect.com",
  "font-src 'self' data:",
  [
    "connect-src 'self'",
    "https://auth.privy.io",
    "https://*.privy.io",
    "wss://*.privy.io",
    "https://*.walletconnect.com",
    "https://*.walletconnect.org",
    "wss://*.walletconnect.com",
    "wss://*.walletconnect.org",
    "https://rpc.walletconnect.com",
    "https://*.polymarket.com",
    "https://clob.polymarket.com",
    "https://gamma-api.polymarket.com",
    "https://api.perpetuals.polymarket.com",
    "https://polygon-rpc.com",
    "https://*.polygon-rpc.com",
    "https://accounts.google.com",
    "https://va.vercel-scripts.com",
    "https://vitals.vercel-insights.com",
    "https://*.vercel-insights.com",
  ].join(" "),
  "frame-src 'self' https://auth.privy.io https://*.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://accounts.google.com https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  serverExternalPackages: ["rss-parser", "@privy-io/react-auth", "@privy-io/server-auth", "@privy-io/wagmi"],
  allowedDevOrigins: [
    "138.124.119.188",
    "localhost",
    "127.0.0.1",
    "*.trycloudflare.com",
  ],
  async redirects() {
    return [{ source: "/guide", destination: "/about", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
        ],
      },
    ];
  },
};

export default nextConfig;
