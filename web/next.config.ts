import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Prefer this package when the monorepo root also has a lockfile.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
