import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['@axiom-ai/core'],
  // Disable strict typed routes — they reject dynamic href values built from
  // user data (e.g. `/runs/${id}`) without per-call type assertions.
  experimental: { typedRoutes: false },
  // The runner does dynamic `await import(file)` which webpack flags as
  // "Critical dependency: the request of a dependency is an expression" — that
  // codepath is server-only and never bundled, so the warning is benign.
}

export default config
