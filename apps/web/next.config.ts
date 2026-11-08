import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@hack/address', '@hack/contracts', '@hack/stdb-bindings'],
};

export default nextConfig;
