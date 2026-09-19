import type { NextConfig } from "next";
import releaseManifest from "./app/release-manifest.json";

const isProduction = process.env.NODE_ENV === "production";

function configuredClientOrigins() {
  const origins = new Set<string>();
  for (const value of [process.env.VITE_FYXBOT_API_URL]) {
    if (!value) continue;
    try {
      const url = new URL(value);
      if (url.protocol === "https:" || (!isProduction && url.protocol === "http:")) origins.add(url.origin);
    } catch { /* Une valeur invalide ne doit pas élargir la politique navigateur. */ }
  }
  return [...origins];
}

const scriptSources = ["'self'", "'unsafe-inline'", ...(!isProduction ? ["'unsafe-eval'"] : [])];
const connectSources = [
  "'self'",
  ...configuredClientOrigins(),
  ...(!isProduction ? [
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "ws://localhost:3000",
    "ws://127.0.0.1:3000",
  ] : []),
];
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSources.join(" ")}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://cdn.discordapp.com",
  "font-src 'self' data:",
  `connect-src ${connectSources.join(" ")}`,
  "object-src 'none'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  ...(isProduction ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-FyxBot-Version", value: releaseManifest.currentVersion },
];

const releaseCacheControl = "public, max-age=0, s-maxage=30, must-revalidate";

const nextConfig: NextConfig = {
  expireTime: 60,
  async rewrites() {
    const apiOrigin = (process.env.FYXBOT_API_ORIGIN
      || "http://127.0.0.1:3001").replace(/\/$/, "");
    return [{
      source: "/api/:path*",
      destination: `${apiOrigin}/api/:path*`,
    }];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Cache-Control", value: releaseCacheControl },
          ...securityHeaders,
        ],
      },
      {
        source: "/release.json",
        headers: [
          { key: "Cache-Control", value: releaseCacheControl },
          { key: "Last-Modified", value: new Date(releaseManifest.releasedAt).toUTCString() },
          { key: "X-FyxBot-Version", value: releaseManifest.currentVersion },
        ],
      },
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/brand/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      },
    ];
  },
};

export default nextConfig;
