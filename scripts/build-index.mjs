/**
 * Étape 2 du pipeline : transformer la donnée brute en actif éditorial.
 *
 * Le point clé : republier le dataset tel quel n'a AUCUNE valeur SEO — Google
 * classerait ça comme contenu dupliqué et la source originale gagnerait.
 * Ce script produit donc de l'information qui n'existe nulle part ailleurs :
 *
 *   1. Un Health Score 0-100 calculé sur l'activité réelle des dépôts
 *      (fréquence de commits, cadence de releases, tendance, communauté).
 *      C'est LA question que se pose tout le monde avant d'installer un service
 *      auto-hébergé : « est-ce que ce projet sera encore maintenu dans 2 ans ? »
 *      Personne n'y répond avec des chiffres. C'est notre angle.
 *   2. Une estimation de la taille de serveur nécessaire (sert au matching affilié).
 *   3. Un graphe de liens internes (aucune page orpheline = tout est crawlable).
 *   4. La résolution SaaS -> alternatives auto-hébergées.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(ROOT, 'data/raw');
const OUT = resolve(ROOT, 'src/data');

if (!existsSync(RAW)) {
  console.error('[build] data/raw absent. Lance d’abord : npm run data:fetch');
  process.exit(1);
}
mkdirSync(OUT, { recursive: true });

/* ------------------------------------------------------------------ utils */

const readYaml = (p) => YAML.parse(readFileSync(p, 'utf8'));
const slugify = (s) =>
  String(s)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
/** Clé de rapprochement par nom : ignore ponctuation, espaces et casse. */
const nameKey = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');

function toDate(v) {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}
/** "YYYY-MM" -> entier ordonnable, pour comparer des mois sans piège de fuseau. */
const monthIndex = (ym) => {
  const [y, m] = String(ym).split('-').map(Number);
  return y * 12 + (m - 1);
};
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const round = (n, d = 0) => Number(n.toFixed(d));

/* ------------------------------------------------------- chargement source */

const softwareFiles = readdirSync(resolve(RAW, 'software')).filter((f) => f.endsWith('.yml'));
const tagFiles = readdirSync(resolve(RAW, 'tags')).filter((f) => f.endsWith('.yml'));
const platformFiles = readdirSync(resolve(RAW, 'platforms')).filter((f) => f.endsWith('.yml'));

const licenseList = readYaml(resolve(RAW, 'licenses.yml')) || [];
const licenseIndex = new Map(licenseList.map((l) => [l.identifier, l]));

const rawSoftware = softwareFiles.map((f) => ({
  slug: slugify(basename(f, '.yml')),
  ...readYaml(resolve(RAW, 'software', f)),
}));

// Mois de référence = mois le plus récent présent dans le dataset.
// On ancre le scoring sur la donnée, pas sur l'horloge : deux builds successifs
// sur le même dataset donnent exactement les mêmes scores.
let refMonth = 0;
for (const s of rawSoftware) {
  for (const ym of Object.keys(s.commit_history || {})) {
    refMonth = Math.max(refMonth, monthIndex(ym));
  }
}
if (!refMonth) refMonth = monthIndex(new Date().toISOString().slice(0, 7));
const refDate = new Date(Math.floor(refMonth / 12), refMonth % 12, 1);

// La source ne conserve qu'une fenêtre glissante d'historique, dont le mois
// courant est incomplet. On mesure cette fenêtre au lieu de supposer 12 mois :
// sinon le mois le plus ancien apparaît à zéro partout alors que la donnée
// n'existe simplement pas — un graphique faux sur 1 300 pages.
let oldestMonth = Infinity;
for (const s of rawSoftware) {
  for (const ym of Object.keys(s.commit_history || {})) {
    oldestMonth = Math.min(oldestMonth, monthIndex(ym));
  }
}
const HISTORY = Number.isFinite(oldestMonth) ? clamp(refMonth - oldestMonth, 1, 24) : 11;
console.log(`[build] Fenêtre d'historique complète : ${HISTORY} mois (le mois courant, partiel, est exclu).`);

/* --------------------------------------------------------- HEALTH SCORE ---
 * 4 composantes, 100 points. Chaque sous-score est affiché sur le site :
 * un score opaque n'inspire pas confiance, un score décomposé fait autorité.
 */

function commitsInWindow(history, startOffset, endOffset) {
  // Fenêtre en mois relative à refMonth. [start, end) en remontant le temps.
  let total = 0;
  for (const [ym, n] of Object.entries(history || {})) {
    const delta = refMonth - monthIndex(ym);
    if (delta >= startOffset && delta < endOffset) total += Number(n) || 0;
  }
  return total;
}

/** Passe 1 : extraire les signaux bruts, sans encore les noter. */
function rawSignals(s) {
  const history = s.commit_history || {};
  const hasHistory = Object.keys(history).length > 0;
  // Le mois courant est partiel dans le dataset : on l'exclut pour ne pas
  // pénaliser artificiellement un projet actif.
  return {
    hasHistory,
    c3: commitsInWindow(history, 1, 4),
    c6: commitsInWindow(history, 1, 7),
    c12: commitsInWindow(history, 1, HISTORY + 1),
    prev3: commitsInWindow(history, 4, 7),
    stars: Number(s.stargazers_count) || 0,
    relDate: toDate(s.current_release?.published_at) || toDate(s.updated_at),
    hasTaggedRelease: Boolean(s.current_release?.published_at),
    scoreable: !(s.archived === true) && (hasHistory || Boolean(s.source_code_url)),
  };
}

/**
 * Table de percentiles : valeur -> rang relatif dans [0,1].
 * On note EN RELATIF plutôt qu'avec des seuils absolus, pour deux raisons :
 *  - des seuils absolus saturent (la moitié du catalogue finissait à 100/100,
 *    ce qui ne distingue plus rien) ;
 *  - « ce projet est dans les 5 % les plus actifs des 1 347 suivis » est une
 *    affirmation vérifiable et impossible à truquer en poussant des commits.
 */
function percentileTable(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  const n = sorted.length;
  return (v) => {
    if (n <= 1) return 1;
    // Borne basse de la plage des ex aequo : les valeurs identiques ont le même rang.
    let lo = 0, hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid] < v) lo = mid + 1;
      else hi = mid;
    }
    let hi2 = lo;
    while (hi2 < n && sorted[hi2] === v) hi2++;
    // Rang moyen des ex aequo, pour ne pas avantager arbitrairement.
    return clamp(((lo + hi2 - 1) / 2) / (n - 1), 0, 1);
  };
}

/** Passe 2 : noter, une fois les percentiles connus. */
function healthScore(s, sig, pctCommits, pctStars) {
  if (s.archived === true) return { status: 'discontinued', score: null, parts: null, signals: sig };
  if (!sig.scoreable) {
    // Pas de dépôt public traçable : on refuse d'inventer une note.
    return { status: 'unrated', score: null, parts: null, signals: sig };
  }

  // 1. Maintenance /40 — volume de commits sur 12 mois, en relatif.
  const maintenance = 40 * pctCommits(sig.c12);

  // 2. Cadence de release /25 — critère ABSOLU : la fraîcheur réelle compte
  //    pour l'utilisateur, indépendamment de ce que font les autres projets.
  let release = 2;
  if (sig.relDate) {
    const days = (refDate - sig.relDate) / 86400000;
    if (days <= 45) release = 25;
    else if (days <= 120) release = 21;
    else if (days <= 240) release = 16;
    else if (days <= 400) release = 11;
    else if (days <= 730) release = 5;
    else release = 1;
  }
  // Sans release taguée, on plafonne : `updated_at` est un signal plus faible.
  if (!sig.hasTaggedRelease) release = Math.min(release, 13);

  // 3. Communauté /20 — popularité relative.
  const community = 20 * pctStars(sig.stars);

  // 4. Tendance /15 — critère ABSOLU : 3 derniers mois contre les 3 précédents.
  let momentum;
  if (sig.c3 === 0) momentum = 0;
  else if (sig.prev3 === 0) momentum = 13;
  else {
    const r = sig.c3 / sig.prev3;
    momentum = r >= 1.25 ? 15 : r >= 0.85 ? 12 : r >= 0.55 ? 8 : r >= 0.25 ? 4 : 1;
  }

  const score = Math.round(maintenance + release + community + momentum);
  const status =
    score >= 82 ? 'thriving'
    : score >= 68 ? 'healthy'
    : score >= 52 ? 'steady'
    : score >= 36 ? 'slowing'
    : 'at-risk';

  return {
    status,
    score,
    parts: {
      maintenance: round(maintenance),
      release: round(release),
      community: round(community),
      momentum: round(momentum),
    },
    // Percentiles exposés : ils justifient la note sur la fiche produit.
    percentiles: {
      commits: round(pctCommits(sig.c12) * 100),
      stars: round(pctStars(sig.stars) * 100),
    },
    signals: {
      c3: sig.c3, c6: sig.c6, c12: sig.c12, prev3: sig.prev3, stars: sig.stars,
      lastRelease: sig.relDate ? sig.relDate.toISOString().slice(0, 10) : null,
    },
  };
}

/* ------------------------------------------- estimation taille de serveur --
 * Sert à proposer l'offre d'hébergement pertinente plutôt qu'un lien générique.
 * C'est une ESTIMATION dérivée du runtime, affichée comme telle sur le site.
 */
const RAM_BY_PLATFORM = {
  java: 2, scala: 2, kotlin: 2, clojure: 2, groovy: 2, elixir: 2, erlang: 2,
  'c#': 2, '.net': 2, haskell: 2,
  ruby: 1, python: 1, nodejs: 1, 'node.js': 1, javascript: 1, typescript: 1,
  php: 1, perl: 1, lua: 1,
  go: 1, rust: 1, c: 1, 'c++': 1, crystal: 1, nim: 1, zig: 1, ocaml: 1,
};
function estimateRamGb(s) {
  let ram = 1;
  for (const p of s.platforms || []) {
    const v = RAM_BY_PLATFORM[String(p).toLowerCase()];
    if (v) ram = Math.max(ram, v);
  }
  // Les gros projets sont presque toujours plus gourmands que leur runtime seul.
  if ((Number(s.stargazers_count) || 0) > 25000) ram = Math.max(ram, 2);
  return ram;
}

/* ------------------------------------------------------------ normalisation */

// Passe 1 : signaux bruts pour tout le catalogue.
const signals = new Map(rawSoftware.map((s) => [s.slug, rawSignals(s)]));

// Base de référence des percentiles : uniquement les projets notables.
// Inclure les archivés et les non-traçables écraserait l'échelle vers le bas.
const base = rawSoftware.filter((s) => signals.get(s.slug).scoreable);
const pctCommits = percentileTable(base.map((s) => signals.get(s.slug).c12));
const pctStars = percentileTable(base.map((s) => signals.get(s.slug).stars));
console.log(`[build] Échelle de notation calibrée sur ${base.length} projets actifs traçables.`);

// Passe 2 : notation.
const software = rawSoftware.map((s) => {
  const health = healthScore(s, signals.get(s.slug), pctCommits, pctStars);
  const history = s.commit_history || {};
  // Historique complet disponible, ordonné, pour le sparkline.
  const spark = [];
  for (let i = HISTORY; i >= 1; i--) {
    const mi = refMonth - i;
    const ym = `${Math.floor(mi / 12)}-${String((mi % 12) + 1).padStart(2, '0')}`;
    spark.push({ month: ym, commits: Number(history[ym]) || 0 });
  }
  return {
    slug: s.slug,
    name: s.name,
    description: s.description || '',
    website: s.website_url || null,
    sourceCode: s.source_code_url || null,
    demo: s.demo_url || null,
    documentation: s.documentation_url || null,
    relatedSoftware: s.related_software_url || null,
    licenses: s.licenses || [],
    platforms: s.platforms || [],
    tags: s.tags || [],
    stars: Number(s.stargazers_count) || 0,
    archived: s.archived === true,
    dependsThirdParty: s.depends_3rdparty === true,
    updatedAt: toDate(s.updated_at)?.toISOString().slice(0, 10) || null,
    release: s.current_release
      ? {
          tag: s.current_release.tag || null,
          publishedAt: toDate(s.current_release.published_at)?.toISOString().slice(0, 10) || null,
        }
      : null,
    spark,
    ...health,
    ramGb: estimateRamGb(s),
  };
});

const bySlug = new Map(software.map((s) => [s.slug, s]));
const byName = new Map(software.map((s) => [nameKey(s.name), s]));

/* ------------------------------------------------------------------- tags */

const tags = tagFiles.map((f) => {
  const data = readYaml(resolve(RAW, 'tags', f)) || {};
  const slug = slugify(basename(f, '.yml'));
  const members = software.filter((s) => (s.tags || []).includes(data.name));
  return {
    slug,
    name: data.name || basename(f, '.yml'),
    description: data.description || '',
    related: (data.related_tags || []).map((t) => ({ name: t, slug: slugify(t) })),
    externalLinks: data.external_links || [],
    count: members.length,
    // Classement par santé : la valeur ajoutée est là, pas dans l'ordre alphabétique.
    members: members
      .slice()
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.stars - a.stars)
      .map((s) => s.slug),
  };
}).filter((t) => t.count > 0);

const tagBySlug = new Map(tags.map((t) => [t.slug, t]));
const tagByName = new Map(tags.map((t) => [t.name, t]));

/* -------------------------------------------------------------- platforms */

const platforms = platformFiles
  .map((f) => {
    const data = readYaml(resolve(RAW, 'platforms', f)) || {};
    const name = data.name || basename(f, '.yml');
    const members = software.filter((s) => (s.platforms || []).includes(name));
    return {
      slug: slugify(basename(f, '.yml')),
      name,
      description: data.description || '',
      count: members.length,
      members: members
        .slice()
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
        .map((s) => s.slug),
    };
  })
  .filter((p) => p.count >= 3);

/* --------------------------------------------------------------- licenses */

const licenses = [...new Set(software.flatMap((s) => s.licenses))]
  .map((id) => {
    const meta = licenseIndex.get(id);
    const members = software.filter((s) => s.licenses.includes(id));
    return {
      slug: slugify(id),
      id,
      name: meta?.name || id,
      url: meta?.url || null,
      count: members.length,
      members: members
        .slice()
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
        .map((s) => s.slug),
    };
  })
  .filter((l) => l.count >= 3)
  .sort((a, b) => b.count - a.count);

/* ----------------------------------------------------------- alternatives */

// `replace(/^﻿/, '')` : les éditeurs Windows ajoutent un BOM que JSON.parse rejette.
const altMap = JSON.parse(readFileSync(resolve(ROOT, 'data/alternatives-map.json'), 'utf8').replace(/^﻿/, ''));

const alternatives = altMap.entries.map((e) => {
  const picked = [];
  const seen = new Set();

  // 1. Les choix éditoriaux, résolus par NOM (robuste aux renommages de fichiers).
  for (const p of e.picks || []) {
    const hit = byName.get(nameKey(p));
    if (hit && !seen.has(hit.slug)) {
      seen.add(hit.slug);
      picked.push(hit.slug);
    }
  }
  // 2. Complément automatique par catégorie, trié par santé.
  //    Garantit une page utile même si le dataset perd des entrées.
  const pool = [];
  for (const tName of e.tags || []) {
    const t = tagByName.get(tName);
    if (!t) continue;
    for (const slug of t.members) if (!seen.has(slug)) pool.push(slug);
  }
  for (const slug of pool) {
    if (picked.length >= 10) break;
    if (seen.has(slug)) continue;
    const s = bySlug.get(slug);
    if (!s || s.archived) continue;
    seen.add(slug);
    picked.push(slug);
  }

  const unresolved = (e.picks || []).filter((p) => !byName.get(nameKey(p)));
  return {
    slug: e.slug,
    name: e.name,
    pain: e.pain,
    tags: (e.tags || []).filter((t) => tagByName.has(t)).map((t) => ({ name: t, slug: tagByName.get(t).slug })),
    picks: picked,
    unresolved,
  };
}).filter((a) => a.picks.length >= 2); // sous 2 options, la page n'a pas d'intérêt

/* -------------------------------------------------------------- comparatifs
 * Pages "A vs B" : très fort volume de recherche, très faible concurrence.
 * On ne génère que des paires pertinentes (même catégorie, projets vivants),
 * sinon on produit des milliers de pages sans valeur qui diluent le site.
 */
const comparePairs = [];
const seenPair = new Set();
for (const t of tags) {
  const top = t.members
    .map((s) => bySlug.get(s))
    .filter((s) => s && !s.archived && s.score !== null)
    .slice(0, 5);
  for (let i = 0; i < top.length; i++) {
    for (let j = i + 1; j < top.length; j++) {
      const [a, b] = [top[i].slug, top[j].slug].sort();
      const key = `${a}--vs--${b}`;
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      comparePairs.push({ slug: key, a, b, tag: t.slug, tagName: t.name });
    }
  }
}

/* ------------------------------------------------- maillage interne (SEO) --
 * Chaque fiche reçoit des voisins pertinents. Une page sans lien entrant
 * n'est pas explorée par Google : c'est la cause n°1 d'échec du SEO programmatique.
 */
for (const s of software) {
  const neighbours = new Map();
  for (const tName of s.tags) {
    const t = tagByName.get(tName);
    if (!t) continue;
    for (const other of t.members) {
      if (other === s.slug) continue;
      neighbours.set(other, (neighbours.get(other) || 0) + 1);
    }
  }
  s.related = [...neighbours.entries()]
    .sort((x, y) => y[1] - x[1] || (bySlug.get(y[0]).score ?? -1) - (bySlug.get(x[0]).score ?? -1))
    .slice(0, 6)
    .map(([slug]) => slug);
  // Les pages "alternative à X" qui citent cette app : backlinks internes forts.
  s.featuredIn = alternatives.filter((a) => a.picks.includes(s.slug)).map((a) => a.slug).slice(0, 5);
}

/* ------------------------------------------------------------------- meta */

let commit = 'unknown';
let dataDate = new Date().toISOString();
try {
  commit = execFileSync('git', ['-C', RAW, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
  dataDate = execFileSync('git', ['-C', RAW, 'log', '-1', '--format=%cI'], { encoding: 'utf8' }).trim();
} catch { /* pas de git en environnement de build : on garde les valeurs par défaut */ }

const ranked = software.filter((s) => s.score !== null).sort((a, b) => b.score - a.score);

const meta = {
  generatedAt: new Date().toISOString(),
  dataCommit: commit,
  dataDate,
  refMonth: `${Math.floor(refMonth / 12)}-${String((refMonth % 12) + 1).padStart(2, '0')}`,
  /** Nombre de mois complets réellement mesurés. Utilisé dans les libellés. */
  historyMonths: HISTORY,
  counts: {
    software: software.length,
    active: software.filter((s) => !s.archived).length,
    discontinued: software.filter((s) => s.archived).length,
    tags: tags.length,
    platforms: platforms.length,
    licenses: licenses.length,
    alternatives: alternatives.length,
    compare: comparePairs.length,
  },
  topRated: ranked.slice(0, 24).map((s) => s.slug),
  rising: software
    .filter((s) => s.score !== null && s.signals?.prev3 > 0 && s.signals.c3 / s.signals.prev3 >= 1.5 && s.signals.c3 >= 15)
    .sort((a, b) => b.signals.c3 / b.signals.prev3 - a.signals.c3 / a.signals.prev3)
    .slice(0, 12)
    .map((s) => s.slug),
  atRisk: software
    .filter((s) => s.status === 'at-risk' && s.stars >= 1000)
    .sort((a, b) => b.stars - a.stars)
    .slice(0, 12)
    .map((s) => s.slug),
};

/* ------------------------------------------------------------------ écriture */

const write = (file, data) => {
  writeFileSync(resolve(OUT, file), JSON.stringify(data));
  const kb = (Buffer.byteLength(JSON.stringify(data)) / 1024).toFixed(0);
  console.log(`[build] ${file.padEnd(20)} ${String(Array.isArray(data) ? data.length : '-').padStart(6)} entrées  ${kb} Ko`);
};

write('software.json', software);
write('tags.json', tags);
write('platforms.json', platforms);
write('licenses.json', licenses);
write('alternatives.json', alternatives);
write('compare.json', comparePairs);
write('meta.json', meta);

const totalPages =
  software.length + tags.length + platforms.length + licenses.length + alternatives.length + comparePairs.length + 8;
console.log(`\n[build] ~${totalPages} pages seront générées.`);
console.log(`[build] Données au ${dataDate.slice(0, 10)} (commit ${commit}).`);

const unresolvedAll = alternatives.flatMap((a) => a.unresolved);
if (unresolvedAll.length) {
  console.log(`[build] ${unresolvedAll.length} choix éditoriaux absents du dataset (comblés automatiquement par catégorie) :`);
  console.log(`        ${[...new Set(unresolvedAll)].join(', ')}`);
}
