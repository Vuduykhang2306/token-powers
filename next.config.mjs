/** @type {import('next').NextConfig} */

// Static export so the whole thing can sit on GitHub Pages with no server.
// BASE_PATH is set by the deploy workflow; empty for local dev.
const basePath = process.env.BASE_PATH ?? "";

export default {
  output: "export",
  basePath,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};
