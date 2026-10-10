/** @type {import('next').NextConfig} */

// Static export so the site can run on GitHub Pages without a server.
// BASE_PATH comes from the deploy workflow and is empty for local dev.
const basePath = process.env.BASE_PATH ?? "";

export default {
  output: "export",
  basePath,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};
