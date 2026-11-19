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
