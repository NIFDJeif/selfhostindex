// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { site } from './site.config.ts';

export default defineConfig({
  site: site.url,
  trailingSlash: 'never',
  build: { format: 'file' },
  integrations: [
    sitemap({
      // Les pages de faible valeur SEO ne polluent pas le sitemap.
      filter: (page) => !page.includes('/404'),
      changefreq: 'weekly',
      lastmod: new Date(),
    }),
  ],
  compressHTML: true,
  prefetch: { prefetchAll: true, defaultStrategy: 'hover' },
});
