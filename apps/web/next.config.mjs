/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@cc-hub/shared'],
  devIndicators: { appIsrStatus: false, buildActivity: false, buildActivityPosition: 'bottom-right' },
  env: {
    NEXT_PUBLIC_RUNNER_URL: process.env.NEXT_PUBLIC_RUNNER_URL ?? 'http://localhost:4000',
  },
};

export default nextConfig;
