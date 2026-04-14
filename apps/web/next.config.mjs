/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@cc-hub/shared'],
  devIndicators: false,
  env: {
    NEXT_PUBLIC_RUNNER_URL: process.env.NEXT_PUBLIC_RUNNER_URL ?? 'http://localhost:4000',
  },
};

export default nextConfig;
