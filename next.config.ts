import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  // Testimonies became the Testimony tab of Take Action; old links and
  // bookmarks keep working.
  async redirects() {
    return [
      { source: '/testimonies', destination: '/take-action/testimony', permanent: true },
      { source: '/testimonies/:path*', destination: '/take-action/testimony/:path*', permanent: true },
      // Nav renamed to Find Bills | Your Tracker | Take Action | Community, and
      // the URLs followed. Query strings (?bill=, ?org=, ?focus=) carry over.
      // Temporary (307), not permanent: a 308 is cached by browsers for good,
      // and these names are still settling.
      { source: '/discover', destination: '/find-bills', permanent: false },
      { source: '/your-bills', destination: '/tracker', permanent: false },
      { source: '/boards', destination: '/community/following', permanent: false },
      { source: '/boards/browse', destination: '/community', permanent: false },
      // /community/your-organization forwards to the admin's own /community/<slug>.
      { source: '/boards/mine', destination: '/community/your-organization', permanent: false },
      { source: '/community/public-view', destination: '/community/your-organization', permanent: false },
      // Org boards moved from /org/<slug>; links already shared keep working.
      { source: '/org/:slug', destination: '/community/:slug', permanent: false },
    ];
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't resolve 'fs' module on the client to prevent this error on build
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        dns: false,
        child_process: false,
      };
    }
    return config;
  },
};

export default nextConfig;
