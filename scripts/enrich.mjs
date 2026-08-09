/**
 * Étape 3 : couche éditoriale, générée par IA sur l'offre gratuite de Google AI Studio.
 *
 * Contraintes de conception, dans l'ordre d'importance :
 *
 *  1. COÛT ZÉRO. On reste sous le quota gratuit : lots quotidiens plafonnés,
 *     temporisation entre appels, et arrêt net sur 429. Aucune carte bancaire
 *     n'est rattachée à ce projet, donc aucun dépassement n'est possible.
 *  2. NON BLOQUANT. Si la clé est absente, le quota épuisé ou l'API en panne,
 *     le script sort en code 0. Le site se construit et se déploie sans lui —
 *     l'enrichissement est un bonus cumulatif, jamais une dépendance.
 *  3. INCRÉMENTAL. Ce qui est déjà généré est conservé et versionné dans Git.
 *     Chaque exécution ajoute au capital existant au lieu de le regénérer,
 *     ce qui fait grossir le site un peu chaque jour, indéfiniment.
 *  4. PAS D'INVENTION. Le prompt interdit d'affirmer des fonctionnalités non
 *     vérifiables. Une fiche produit qui ment est pire qu'une fiche vide :
 *     elle détruit la confiance qui fait cliquer sur les liens d'hébergement.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'data/enriched');
const SOFTWARE = resolve(ROOT, 'src/data/software.json');
const ALTS = resolve(ROOT, 'src/data/alternatives.json');

const API_KEY = process.env.GEMINI_API_KEY || '';
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const BATCH = Number(process.env.ENRICH_BATCH || 40);
const DELAY_MS = Number(process.env.ENRICH_DELAY_MS || 6500); // ~9 req/min, sous la limite gratuite

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!API_KEY) {
  console.log('[enrich] GEMINI_API_KEY absente — étape ignorée, le site se construit sans.');
  process.exit(0);
}
if (!existsSync(SOFTWARE)) {
  console.log('[enrich] src/data/software.json absent — lance d’abord npm run data.');
  process.exit(0);
}
mkdirSync(OUT, { recursive: true });

const software = JSON.parse(readFileSync(SOFTWARE, 'utf8'));
const alternatives = existsSync(ALTS) ? JSON.parse(readFileSync(ALTS, 'utf8')) : [];

const done = new Set(
  readdirSync(OUT).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')),
);

/* ------------------------------------------------------------- priorités --
 * On enrichit d'abord ce qui peut rapporter. Une fiche citée sur une page
 * « alternative à Notion » reçoit du trafic commercial ; une fiche obscure
 * en bas d'une catégorie n'en reçoit pas. Le budget quotidien va au premier.
 */
const featured = new Set(alternatives.flatMap((a) => a.picks.slice(0, 6)));

const queue = software
  .filter((s) => !done.has(s.slug))
  .map((s) => {
    let priority = 0;
    if (featured.has(s.slug)) priority += 1000;          // pages à intention d'achat
    priority += Math.min(300, (s.score ?? 0) * 3);        // projets vivants d'abord
    priority += Math.min(200, Math.log10(s.stars + 1) * 40);
    return { s, priority };
  })
  .sort((a, b) => b.priority - a.priority)
  .slice(0, BATCH)
  .map((x) => x.s);

if (queue.length === 0) {
  console.log(`[enrich] Rien à faire : ${done.size}/${software.length} fiches déjà enrichies.`);
  process.exit(0);
}

console.log(`[enrich] ${done.size}/${software.length} déjà faites. Lot de ${queue.length} (modèle ${MODEL}).`);

/* ------------------------------------------------------------------ prompt */

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    goodFor: { type: 'string' },
    watchOut: { type: 'string' },
    deployNotes: { type: 'string' },
  },
  required: ['summary', 'goodFor', 'watchOut', 'deployNotes'],
};

function buildPrompt(s) {
  return `You are writing a factual entry for a directory of self-hosted software. The reader is technical and is deciding whether to deploy this on their own server.

FACTS YOU HAVE (do not contradict these, do not repeat them verbatim):
- Name: ${s.name}
- Official description: ${s.description}
- Categories: ${s.tags.join(', ') || 'unknown'}
- Built with: ${s.platforms.join(', ') || 'unknown'}
- Licence: ${s.licenses.join(', ') || 'unknown'}
- Repository stars: ${s.stars}
- Maintenance health score we computed: ${s.score ?? 'unrated'}/100 (${s.status})
- Commits in the last complete months: ${s.signals?.c12 ?? 'unknown'}
- Latest tagged release: ${s.release?.tag ?? 'none'} ${s.release?.publishedAt ? `on ${s.release.publishedAt}` : ''}

RULES — these matter more than style:
1. Never invent specific features, integrations, version numbers, benchmarks or company facts you cannot infer from the description above. If you do not know, write about the category of problem it solves instead.
2. Do not restate the health score or commit counts; that data is already displayed next to your text.
3. No marketing language. No "powerful", "seamless", "robust", "game-changing", "in today's world".
4. Write in British English, plain and direct. Second person ("you") is fine.
5. If the official description is vague, say what the category generally does and mark the uncertainty honestly rather than guessing specifics.

PRODUCE JSON with exactly these four fields:
- "summary": 2-3 sentences. What this software actually does, in concrete terms, for someone who has never heard of it.
- "goodFor": 1-2 sentences. The specific situation or user this is a good fit for.
- "watchOut": 1-2 sentences. An honest constraint, limitation or trade-off — operational burden, licence implication, hardware need, maturity, or the fact that it overlaps heavily with better-known alternatives. Never write "no downsides". This field is what makes the entry trustworthy.
- "deployNotes": 1-2 sentences. Practical hosting considerations you can reasonably infer from the runtime (${s.platforms.join(', ') || 'unknown'}) — e.g. whether it typically needs a separate database, a reverse proxy for TLS, or persistent storage. Hedge appropriately with "usually" or "typically" where you are generalising from the runtime rather than stating a documented fact.`;
}

/* -------------------------------------------------------------- appel API */

async function generate(s) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;
  const body = {
    contents: [{ parts: [{ text: buildPrompt(s) }] }],
    generationConfig: {
      temperature: 0.75, // assez haut pour éviter 1 300 paragraphes de structure identique
      maxOutputTokens: 900,
      responseMimeType: 'application/json',
      responseSchema: SCHEMA,
    },
    safetySettings: [],
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    const e = new Error('quota');
    e.quota = true;
    throw e;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('réponse vide');
  return JSON.parse(text);
}

/* ------------------------------------------------------------------ boucle */

let ok = 0, failed = 0;
for (const [i, s] of queue.entries()) {
  try {
    const data = await generate(s);
    // Filet minimal : on refuse d'écrire une fiche tronquée ou vide.
    if (!data.summary || data.summary.length < 40) throw new Error('résumé trop court');

    writeFileSync(
      resolve(OUT, `${s.slug}.json`),
      JSON.stringify(
        {
          summary: data.summary.trim(),
          goodFor: data.goodFor?.trim() || undefined,
          watchOut: data.watchOut?.trim() || undefined,
          deployNotes: data.deployNotes?.trim() || undefined,
          model: MODEL,
          generatedAt: new Date().toISOString().slice(0, 10),
        },
        null,
        2,
      ),
    );
    ok++;
    console.log(`[enrich] ${String(i + 1).padStart(3)}/${queue.length} ✓ ${s.slug}`);
  } catch (err) {
    if (err.quota) {
      // Quota journalier atteint : on s'arrête proprement, le reste passera demain.
      console.log(`[enrich] Quota gratuit atteint après ${ok} fiches. Reprise à la prochaine exécution.`);
      break;
    }
    failed++;
    console.warn(`[enrich] ${String(i + 1).padStart(3)}/${queue.length} ✗ ${s.slug} — ${err.message}`);
  }
  if (i < queue.length - 1) await sleep(DELAY_MS);
}

const total = done.size + ok;
console.log(`\n[enrich] +${ok} fiches (${failed} échecs). Total : ${total}/${software.length} (${((100 * total) / software.length).toFixed(1)} %).`);
// Toujours 0 : un échec d'enrichissement ne doit jamais casser le déploiement.
process.exit(0);
