import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard',
          '/meetings',
          '/settings',
          '/paywall',
          '/processing-payment',
          '/desktop-success',
          '/api/',
          '/auth/',
        ],
      },
    ],
    sitemap: 'https://omaginelabs.com/sitemap.xml',
  };
}
