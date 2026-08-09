/** Accès typé aux données générées par scripts/build-index.mjs. */
import softwareJson from '../data/software.json';
import tagsJson from '../data/tags.json';
import platformsJson from '../data/platforms.json';
import licensesJson from '../data/licenses.json';
import alternativesJson from '../data/alternatives.json';
import compareJson from '../data/compare.json';
import metaJson from '../data/meta.json';

export type Status = 'thriving' | 'healthy' | 'steady' | 'slowing' | 'at-risk' | 'discontinued' | 'unrated';

export interface Software {
  slug: string;
  name: string;
  description: string;
  website: string | null;
  sourceCode: string | null;
  demo: string | null;
  documentation: string | null;
  relatedSoftware: string | null;
  licenses: string[];
  platforms: string[];
  tags: string[];
  stars: number;
  archived: boolean;
  dependsThirdParty: boolean;
  updatedAt: string | null;
  release: { tag: string | null; publishedAt: string | null } | null;
  spark: { month: string; commits: number }[];
  status: Status;
  score: number | null;
  parts: { maintenance: number; release: number; community: number; momentum: number } | null;
  percentiles?: { commits: number; stars: number };
  signals?: { c3: number; c6: number; c12: number; prev3: number; stars: number; lastRelease: string | null };
  ramGb: number;
  related: string[];
  featuredIn: string[];
}

export interface Tag {
  slug: string; name: string; description: string;
  related: { name: string; slug: string }[];
  externalLinks: { title: string; url: string }[];
  count: number; members: string[];
}
export interface Platform { slug: string; name: string; description: string; count: number; members: string[] }
export interface License { slug: string; id: string; name: string; url: string | null; count: number; members: string[] }
export interface Alternative {
  slug: string; name: string; pain: string;
  tags: { name: string; slug: string }[];
  picks: string[]; unresolved: string[];
}
export interface ComparePair { slug: string; a: string; b: string; tag: string; tagName: string }

export const software = softwareJson as unknown as Software[];
export const tags = tagsJson as unknown as Tag[];
export const platforms = platformsJson as unknown as Platform[];
export const licenses = licensesJson as unknown as License[];
export const alternatives = alternativesJson as unknown as Alternative[];
export const comparePairs = compareJson as unknown as ComparePair[];
export const meta = metaJson as {
  generatedAt: string; dataCommit: string; dataDate: string; refMonth: string;
  historyMonths: number;
  counts: Record<string, number>;
  topRated: string[]; rising: string[]; atRisk: string[];
};

/**
 * Nombre de mois complets réellement mesurés. Jamais codé en dur dans les
 * libellés : la source peut changer la taille de sa fenêtre d'historique, et
 * afficher « 12 mois » sur des données qui en couvrent 11 est un mensonge
 * discret mais vérifiable — exactement ce qui détruit la confiance dans un score.
 */
export const HISTORY_MONTHS = meta.historyMonths ?? 12;

const softwareMap = new Map(software.map((s) => [s.slug, s]));
const tagMap = new Map(tags.map((t) => [t.slug, t]));
const tagByName = new Map(tags.map((t) => [t.name, t]));

export const getSoftware = (slug: string): Software | undefined => softwareMap.get(slug);
export const getSoftwareMany = (slugs: string[]): Software[] =>
  slugs.map((s) => softwareMap.get(s)).filter((s): s is Software => Boolean(s));
export const getTag = (slug: string) => tagMap.get(slug);
export const getTagByName = (name: string) => tagByName.get(name);

/** Libellé + couleur d'un statut de santé. Une seule définition, partout. */
export const STATUS_META: Record<Status, { label: string; hue: string; blurb: string }> = {
  thriving: { label: 'Thriving', hue: 'ok', blurb: 'High commit volume, frequent releases and growing activity.' },
  healthy: { label: 'Healthy', hue: 'ok', blurb: 'Actively maintained with regular releases.' },
  steady: { label: 'Steady', hue: 'mid', blurb: 'Maintained, but at a slower pace than the leaders in its category.' },
  slowing: { label: 'Slowing', hue: 'warn', blurb: 'Activity has dropped noticeably. Check the repository before committing to it.' },
  'at-risk': { label: 'At risk', hue: 'bad', blurb: 'Little to no recent activity. Treat as unmaintained until proven otherwise.' },
  discontinued: { label: 'Discontinued', hue: 'bad', blurb: 'The repository is archived. Do not deploy for new projects.' },
  unrated: { label: 'Unrated', hue: 'muted', blurb: 'No public repository to measure. We do not guess a score.' },
};

export const fmtNumber = (n: number) =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '')}k` : String(n);

export const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** Ancienneté en mois, pour formuler « il y a X mois » sans dépendance. */
export function monthsSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - d.getTime()) / (30.44 * 86400000)));
}

/** Trie par score décroissant, les non notés en dernier. */
export const byScore = (a: Software, b: Software) => (b.score ?? -1) - (a.score ?? -1) || b.stars - a.stars;
