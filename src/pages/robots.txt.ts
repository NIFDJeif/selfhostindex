import type { APIContext } from 'astro';
import { site } from '../../site.config';

export async function GET(_context: APIContext) {
  const body = `User-agent: *
Allow: /

# Le site est entièrement statique : aucune zone privée à protéger.
Sitemap: ${site.url}/sitemap-index.xml
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
