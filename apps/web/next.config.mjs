/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@cc-hub/shared'],
  devIndicators: { appIsrStatus: false, buildActivity: false, buildActivityPosition: 'bottom-right' },
  env: {
    NEXT_PUBLIC_RUNNER_URL: process.env.NEXT_PUBLIC_RUNNER_URL ?? 'http://localhost:4000',
  },
  webpack: (config) => {
    // Allow TS's `./foo.js` node16-style imports to resolve to the `.ts`
    // source that lives inside the transpiled workspace packages.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    };
    return config;
  },
};

export default nextConfig;
