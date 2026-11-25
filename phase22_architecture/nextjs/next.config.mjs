import withSerwistInit from "@serwist/next";

// NOTE: Per Next.js 15 + React 19 security & App Router compatibility,
// @serwist/next replaces deprecated next-pwa (which is unmaintained on Webpack 5).
const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    unoptimized: true,
  },
};

export default withSerwist(nextConfig);
