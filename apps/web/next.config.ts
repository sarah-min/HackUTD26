import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@hack/address',
    '@hack/contracts',
    '@hack/finance',
    '@hack/storage',
    '@hack/stdb-bindings',
  ],
};

export default nextConfig;
