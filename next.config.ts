import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  // getReadyDb() migrates at runtime: ship the SQL migrations with every serverless function on Vercel.
  outputFileTracingIncludes: { "/**": ["./src/db/migrations/**/*"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
