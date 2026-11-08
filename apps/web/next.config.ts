import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: [
    '@hack/address',
    '@hack/agent',
    '@hack/contracts',
    '@hack/damage',
    '@hack/finance',
    '@hack/storage',
    '@hack/stdb-bindings',
  ],
};

export default nextConfig;
