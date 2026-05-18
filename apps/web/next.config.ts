import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@buecherturm/api',
    '@buecherturm/shared',
    '@buecherturm/database',
    '@buecherturm/ai',
  ],
};

export default nextConfig;
