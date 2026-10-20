import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    // The application only renders trusted QR/data URLs with plain <img> tags.
    // Disable the unused image optimizer so untrusted input cannot reach sharp.
    unoptimized: true
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "2mb"
    }
  }
};

export default nextConfig;
