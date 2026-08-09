import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { software } from '../lib/data';
import { stripMd } from '../lib/prose';
import { site } from '../../site.config';

/**
 * Flux des releases récentes. Un flux réellement chronologique (et pas un
 * « top 20 » figé) donne aux agrégateurs une raison de repasser, ce qui aide
 * à faire découvrir un domaine neuf.
 */
export async function GET(context: APIContext) {
  const items = software
    .filter((s) => s.release?.publishedAt && !s.archived)
    .sort((a, b) => (b.release!.publishedAt! > a.release!.publishedAt! ? 1 : -1))
    .slice(0, 60);

  return rss({
    title: `${site.name} — recent releases`,
    description: 'New releases from actively maintained self-hosted projects, with current health scores.',
    site: context.site ?? site.url,
    items: items.map((s) => ({
      title: `${s.name} ${s.release!.tag ?? ''}`.trim(),
      link: `/software/${s.slug}`,
      pubDate: new Date(s.release!.publishedAt!),
      description: `${stripMd(s.description)} — health score ${s.score ?? 'unrated'}/100.`,
    })),
    customData: '<language>en</language>',
  });
}
