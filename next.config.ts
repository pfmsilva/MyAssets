import type { NextConfig } from "next";
import { execSync } from "node:child_process";
import pkg from "./package.json";

function gitSha() {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA;
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

const nextConfig: NextConfig = {
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
  serverExternalPackages: ["pdfkit", "pdfjs-dist"],
  // pdf.js loads its worker dynamically; make sure serverless bundles ship it (and pdfkit's font data)
  outputFileTracingIncludes: {
    "/*": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs", "./node_modules/pdfjs-dist/legacy/build/pdf.mjs", "./node_modules/pdfkit/js/data/**/*"],
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
    NEXT_PUBLIC_GIT_SHA: gitSha(),
    NEXT_PUBLIC_GIT_BRANCH: process.env.VERCEL_GIT_COMMIT_REF ?? "",
    NEXT_PUBLIC_BUILD_DATE: new Date().toISOString(),
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "",
  },
};

export default nextConfig;
