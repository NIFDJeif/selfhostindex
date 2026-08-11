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
 *
 * Tout le flux impératif vit dans main(). C'est délibéré : appeler process.exit()
 * pendant qu'une connexion HTTP est encore ouverte fait planter Node sous Windows
 * (assertion libuv) et renvoie un code d'erreur au lieu de 0. On sort donc par
 * `return`, et on laisse la boucle d'événements se vider d'elle-même.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'data/enriched');
const SOFTWARE = resolve(ROOT, 'src/data/software.json');
const ALTS = resolve(ROOT, 'src/data/alternatives.json');

const API_KEY = process.env.GEMINI_API_KEY || '';
// Résolu à l'exécution (cf. resolveModel) plutôt que codé en dur : Google retire
// régulièrement l'accès aux anciens modèles pour les nouveaux comptes, et un nom
// figé ici transforme le moteur d'enrichissement en panne silencieuse.
let MODEL = process.env.GEMINI_MODEL || '';
const BATCH = Number(process.env.ENRICH_BATCH || 40);
const DELAY_MS = Number(process.env.ENRICH_DELAY_MS || 6500); // ~9 req/min, sous la limite gratuite
const MAX_STREAK = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* --------------------------------------------------------- choix du modèle --
 * On demande à l'API ce qu'elle propose réellement, au lieu de parier sur un nom.
 * `gemini-2.5-flash` a par exemple été fermé aux nouveaux comptes, ce qui faisait
 * échouer les 40 fiches d'un lot avec un 404 par appel.
 * Priorité aux modèles « flash » : ce sont les seuls généreusement dotés sur
 * l'offre gratuite, et la tâche (4 paragraphes factuels) n'exige pas mieux.
 */
async function resolveModel() {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}&pageSize=200`,
  );
  if (!res.ok) throw new Error(`liste des modèles indisponible (HTTP ${res.status})`);
  const { models = [] } = await res.json();

  const usable = models
    .filter((m) => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map((m) => String(m.name).replace(/^models\//, ''))
    // Modèles spécialisés : hors sujet pour de la génération de texte.
    .filter((n) => !/embedding|aqa|tts|image|imagen|vision|audio|live|native|veo|robotics/i.test(n));

  if (usable.length === 0) throw new Error('aucun modèle de génération de texte disponible');

  const prefer = [/flash-lite/i, /flash/i, /^gemini-/i];
  // Les versions « preview » / « exp » changent sans préavis : on ne s'en sert
  // qu'en dernier recours, si rien de stable n'est proposé.
  const stable = usable.filter((n) => !/preview|exp\b|experimental/i.test(n));

  for (const pool of [stable, usable]) {
    for (const p of prefer) {
      // Tri décroissant : « gemini-2.5-flash » passe avant « gemini-2.0-flash ».
      const hits = pool.filter((n) => p.test(n)).sort().reverse();
      if (hits.length) return hits[0];
    }
  }
  return usable[0];
}

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
  if (!res.ok) {
    // Message aplati sur une ligne : le JSON d'erreur brut noyait le log CI.
    const detail = (await res.text()).replace(/\s+/g, ' ').slice(0, 160);
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('réponse vide');
  return JSON.parse(text);
}

/* -------------------------------------------------------------------- main */

async function main() {
  if (!API_KEY) {
    console.log('[enrich] GEMINI_API_KEY absente — étape ignorée, le site se construit sans.');
    return;
  }
  if (!existsSync(SOFTWARE)) {
    console.log('[enrich] src/data/software.json absent — lance d’abord npm run data.');
    return;
  }
  mkdirSync(OUT, { recursive: true });

  const software = JSON.parse(readFileSync(SOFTWARE, 'utf8'));
  const alternatives = existsSync(ALTS) ? JSON.parse(readFileSync(ALTS, 'utf8')) : [];

  const done = new Set(
    readdirSync(OUT).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')),
  );

  /* ----------------------------------------------------------- priorités --
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
    return;
  }

  if (!MODEL) {
    try {
      MODEL = await resolveModel();
      console.log(`[enrich] Modèle retenu automatiquement : ${MODEL}`);
    } catch (err) {
      console.log(`[enrich] Impossible de choisir un modèle (${err.message}) — étape ignorée.`);
      return;
    }
  } else {
    console.log(`[enrich] Modèle imposé par GEMINI_MODEL : ${MODEL}`);
  }

  console.log(`[enrich] ${done.size}/${software.length} déjà faites. Lot de ${queue.length}.`);

  let ok = 0, failed = 0, streak = 0;

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
      streak = 0;
      console.log(`[enrich] ${String(i + 1).padStart(3)}/${queue.length} ✓ ${s.slug}`);
    } catch (err) {
      if (err.quota) {
        // Quota journalier atteint : on s'arrête proprement, le reste passera demain.
        console.log(`[enrich] Quota gratuit atteint après ${ok} fiches. Reprise à la prochaine exécution.`);
        break;
      }
      failed++;
      streak++;
      console.warn(`[enrich] ${String(i + 1).padStart(3)}/${queue.length} ✗ ${s.slug} — ${err.message}`);
      // Coupe-circuit : quand la cause est globale (modèle retiré, clé révoquée),
      // les 40 appels échouent identiquement. Sans ce garde-fou, le job brûle
      // 4 minutes de CI à répéter la même erreur avant d'abandonner.
      if (streak >= MAX_STREAK) {
        console.warn(`[enrich] ${MAX_STREAK} échecs consécutifs — cause manifestement globale, on arrête là.`);
        break;
      }
    }
    if (i < queue.length - 1) await sleep(DELAY_MS);
  }

  const total = done.size + ok;
  console.log(
    `\n[enrich] +${ok} fiches (${failed} échecs). Total : ${total}/${software.length} ` +
      `(${((100 * total) / software.length).toFixed(1)} %).`,
  );
}

// Aucun process.exit() : une erreur imprévue est journalisée puis avalée, pour
// que l'enrichissement ne puisse jamais bloquer le déploiement du site.
try {
  await main();
} catch (err) {
  console.warn(`[enrich] Erreur inattendue, étape abandonnée — ${err.message}`);
}
