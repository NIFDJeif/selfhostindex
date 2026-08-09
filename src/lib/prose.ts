/**
 * Génération de texte FACTUEL à partir des chiffres.
 *
 * Le piège classique du SEO programmatique : 2 000 pages avec le même gabarit et
 * trois variables changées. Google appelle ça du « contenu mince » et
 * désindexe le site entier — c'est la cause d'échec numéro un.
 *
 * Parade appliquée ici :
 *  - chaque phrase énonce un fait mesuré (un nombre de commits, une date, un rang),
 *    donc deux pages ne peuvent pas dire la même chose ;
 *  - les tournures varient de façon déterministe (hash du slug), pour que la
 *    structure ne se répète pas mot pour mot d'une page à l'autre ;
 *  - on n'affirme jamais ce qu'on ne mesure pas.
 */
import type { Software } from './data';
import { monthsSince, HISTORY_MONTHS } from './data';

/** Libellé de la fenêtre réellement mesurée — jamais « douze mois » en dur. */
const WIN = `${HISTORY_MONTHS} months`;

/** Hash stable : la même page produit toujours le même texte entre deux builds. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
const pick = <T,>(arr: T[], seed: string, salt = 0): T => arr[(hash(seed) + salt * 7919) % arr.length];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Paragraphe « ce projet est-il vivant ? » — la question qui amène le trafic. */
export function maintenanceProse(sw: Software): string[] {
  const out: string[] = [];
  const sig = sw.signals;
  if (!sig) return out;

  // Non noté ≠ inactif. Sans ce cas, les compteurs à zéro produisaient
  // « aucun commit enregistré » sur des projets parfaitement vivants,
  // simplement parce qu'ils sont développés hors GitHub.
  if (sw.status === 'unrated') {
    out.push(
      `We cannot measure this one. ${sw.name} is developed outside the platforms our data source collects activity from${sw.sourceCode ? `, and its repository lives at ${new URL(sw.sourceCode).host}` : ''} — so there is no commit history or release cadence here to score.`,
    );
    out.push(
      `Read that as missing data, not as a warning. Several of the best-maintained projects in this catalogue are unrated for exactly this reason. To judge it, open the repository and look at the date of the most recent commit yourself.`,
    );
    if (sw.dependsThirdParty) {
      out.push(`Note that ${sw.name} depends on a third-party service to work fully. It is self-hosted, but not self-contained.`);
    }
    return out;
  }

  if (sw.status === 'discontinued') {
    out.push(
      `The repository for ${sw.name} has been archived by its maintainers. It will receive no further fixes, including security fixes. Treat anything you deploy from it as frozen, and prefer an actively developed alternative from the same category.`,
    );
    return out;
  }

  const { c3, c12, prev3 } = sig;
  const monthsRelease = monthsSince(sw.release?.publishedAt ?? null);

  // 1. Volume d'activité, formulé selon l'intensité réelle.
  if (c12 === 0) {
    out.push(
      pick(
        [
          `No commits were recorded on the public repository in the last ${WIN}. A project can be feature-complete rather than abandoned, but nothing here distinguishes the two — check the issue tracker before you depend on it.`,
          `The repository shows zero commits over the last ${WIN}. That is not automatically fatal for a small, finished tool, but it does mean nobody is shipping fixes right now.`,
        ],
        sw.slug,
      ),
    );
  } else if (c3 === 0) {
    out.push(
      `${sw.name} logged ${plural(c12, 'commit', 'commits')} over the last ${WIN}, but none in the most recent quarter. Development has paused rather than stopped outright — worth watching before a production deployment.`,
    );
  } else {
    const perMonth = Math.round(c3 / 3);
    out.push(
      pick(
        [
          `${sw.name} is under active development: ${plural(c12, 'commit', 'commits')} landed over the last ${WIN}, averaging roughly ${plural(perMonth, 'commit', 'commits')} a month in the most recent quarter.`,
          `Development is ongoing. The repository recorded ${plural(c12, 'commit', 'commits')} over the same window, and the last three months alone account for ${c3} of them.`,
          `Over the last ${WIN} the project absorbed ${plural(c12, 'commit', 'commits')}, of which ${c3} arrived in the most recent quarter — roughly ${plural(perMonth, 'commit', 'commits')} a month.`,
        ],
        sw.slug,
      ),
    );
  }

  // 2. Tendance, uniquement si elle est significative.
  if (c3 > 0 && prev3 > 0) {
    const ratio = c3 / prev3;
    if (ratio >= 1.5) {
      out.push(`Activity is accelerating: the last quarter carried ${Math.round((ratio - 1) * 100)}% more commits than the one before it.`);
    } else if (ratio <= 0.5) {
      out.push(`Activity is cooling: commits are down ${Math.round((1 - ratio) * 100)}% against the previous quarter. One slow quarter is normal; two in a row is a signal.`);
    }
  }

  // 3. Cadence de publication.
  if (sw.release?.publishedAt && monthsRelease !== null) {
    const tag = sw.release.tag ? `${sw.release.tag}` : 'the latest release';
    if (monthsRelease <= 2) {
      out.push(`The most recent tagged release, ${tag}, shipped ${monthsRelease <= 1 ? 'within the last month' : 'about two months ago'} — a current, installable version exists today.`);
    } else if (monthsRelease <= 12) {
      out.push(`The most recent tagged release, ${tag}, is about ${plural(monthsRelease, 'month', 'months')} old.`);
    } else {
      out.push(`The last tagged release, ${tag}, is over ${Math.floor(monthsRelease / 12)} year${monthsRelease >= 24 ? 's' : ''} old. If you deploy, expect to build from the default branch rather than a stable tag.`);
    }
  } else {
    out.push(`No tagged releases are published, so there is no stable version to pin to — you would deploy from the default branch or a container image built from it.`);
  }

  // 4. Mise en garde spécifique aux dépendances externes.
  if (sw.dependsThirdParty) {
    out.push(`Note that ${sw.name} depends on a third-party service to work fully. It is self-hosted, but not self-contained: if that external service changes its terms or disappears, your instance is affected.`);
  }
  return out;
}

/** Phrase de contexte concurrentiel, basée sur le rang dans la catégorie. */
export function positionProse(sw: Software, categoryName: string, rank: number, total: number): string {
  if (sw.score === null) return '';
  const pctile = Math.round((1 - (rank - 1) / Math.max(1, total - 1)) * 100);
  if (rank === 1) {
    return `Among the ${total} ${categoryName.toLowerCase()} projects we track, ${sw.name} currently has the highest health score.`;
  }
  if (pctile >= 75) {
    return `Of the ${total} projects we track in ${categoryName}, ${sw.name} ranks #${rank} by health score — in the top quarter of its category.`;
  }
  if (pctile >= 40) {
    return `${sw.name} ranks #${rank} of ${total} in ${categoryName}, placing it mid-table for maintenance activity.`;
  }
  return `${sw.name} ranks #${rank} of ${total} tracked ${categoryName.toLowerCase()} projects. Several better-maintained options exist in the same category — they are listed below.`;
}

/** Résumé d'ouverture d'une page catégorie. Varié, chiffré, jamais générique. */
export function categoryProse(name: string, members: Software[]): string {
  const total = members.length;
  const scored = members.filter((m) => m.score !== null);
  const healthy = scored.filter((m) => m.score! >= 68).length;
  const risky = scored.filter((m) => m.status === 'at-risk').length;
  const median = scored.length
    ? scored.map((m) => m.score!).sort((a, b) => a - b)[Math.floor(scored.length / 2)]
    : null;

  const parts = [
    `We track ${total} self-hosted ${name.toLowerCase()} ${total === 1 ? 'project' : 'projects'}.`,
  ];
  if (median !== null) {
    parts.push(`The median health score in this category is ${median}, against ${healthy} ${healthy === 1 ? 'project' : 'projects'} rated healthy or better`);
    parts.push(risky > 0 ? `and ${risky} showing little recent activity.` : `and none currently flagged as at risk.`);
  }
  parts.push(`The table below is ordered by health score, not popularity — the most starred project in a category is frequently not the best maintained one.`);
  return parts.join(' ');
}

/** Verdict d'un comparatif A vs B, dérivé strictement des écarts mesurés. */
export function compareVerdict(a: Software, b: Software): string {
  const sa = a.score ?? 0;
  const sb = b.score ?? 0;
  const [hi, lo, hiS, loS] = sa >= sb ? [a, b, sa, sb] : [b, a, sb, sa];
  const gap = hiS - loS;

  if (gap <= 4) {
    return `${a.name} and ${b.name} are closely matched on maintenance health (${sa} vs ${sb}). Neither is the safer bet on activity alone, so choose on features, licence and the stack you already run.`;
  }
  const reasons: string[] = [];
  if (a.parts && b.parts) {
    const hp = hi.parts!, lp = lo.parts!;
    if (hp.maintenance - lp.maintenance >= 6) reasons.push('a higher commit volume');
    if (hp.release - lp.release >= 5) reasons.push('more recent releases');
    if (hp.momentum - lp.momentum >= 4) reasons.push('a stronger recent trend');
    if (hp.community - lp.community >= 5) reasons.push('a larger community');
  }
  const because = reasons.length ? ` on the strength of ${reasons.slice(0, 2).join(' and ')}` : '';
  const strength = gap >= 20 ? 'clearly ahead' : gap >= 10 ? 'ahead' : 'slightly ahead';
  return `${hi.name} scores ${hiS} against ${lo.name}'s ${loS}, putting it ${strength}${because}. That measures project health, not feature fit — ${lo.name} may still be the right choice if it does what you need.`;
}

/** Nettoie le markdown inline présent dans les descriptions amont. */
export const stripMd = (s: string) =>
  s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1').replace(/[*_`]/g, '').trim();
