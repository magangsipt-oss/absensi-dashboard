import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: [
    "serialport",
    "@serialport/bindings-cpp",
    "@serialport/parser-readline",
  ],
};

export default nextConfig;
