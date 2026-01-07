import type { NextConfig } from "next";

/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      {
        source: "/archetype",
        destination: "/",
        permanent: false,
      },
    ];
  },
};

module.exports = nextConfig;

export default nextConfig;
