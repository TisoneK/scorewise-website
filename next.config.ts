import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  // Readable stack traces in production — crash telemetry (CLIENT_CRASH
  // activity entries + the error boundary display) is near-useless with
  // minified frames while we hunt the Results tab crashes.
  productionBrowserSourceMaps: true,
  reactStrictMode: false,
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
