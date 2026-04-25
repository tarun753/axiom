import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['@axiom-ai/core'],
  experimental: { typedRoutes: true },
}

export default config
