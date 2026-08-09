/**
 * Étape 5 : soumission IndexNow.
 *
 * Pourquoi ça compte pour un domaine neuf : sans backlinks, un site met des
 * semaines à être découvert. IndexNow inverse le flux — c'est nous qui
 * notifions les moteurs. Bing, Yandex et Seznam le prennent en charge,
 * gratuitement et sans inscription (la clé publiée à la racine suffit à
 * prouver qu'on contrôle le domaine).
 *
 * Google n'utilise pas IndexNow : pour lui, c'est le sitemap déclaré dans la
 * Search Console qui fait le travail (cf. ACCOUNTS.md).
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SITEMAP = resolve(ROOT, 'dist/sitemap-0.xml');

// On lit la config sans compilateur TS : une seule valeur nous intéresse.
const cfg = readFileSync(resolve(ROOT, 'site.config.ts'), 'utf8');
const grab = (name) => cfg.match(new RegExp(`${name}:\\s*'([^']*)'`))?.[1] ?? '';
const key = process.env.INDEXNOW_KEY || grab('indexNowKey');
const siteUrl = grab('url');

if (!key) {
  console.log('[indexnow] Aucune clé configurée — étape ignorée.');
  process.exit(0);
}
if (!existsSync(SITEMAP)) {
  console.log('[indexnow] dist/sitemap-0.xml absent (site non construit) — étape ignorée.');
  process.exit(0);
}

const host = new URL(siteUrl).host;
const urls = [...readFileSync(SITEMAP, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

if (urls.length === 0) {
  console.log('[indexnow] Sitemap vide — étape ignorée.');
  process.exit(0);
}

// Le protocole plafonne à 10 000 URL par requête.
const CHUNK = 10000;
let submitted = 0;

for (let i = 0; i < urls.length; i += CHUNK) {
  const batch = urls.slice(i, i + CHUNK);
  try {
    const res = await fetch('https://api.indexnow.org/IndexNow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        host,
        key,
        keyLocation: `${siteUrl}/${key}.txt`,
        urlList: batch,
      }),
    });
    // 200 = accepté, 202 = accepté mais clé en cours de validation.
    if (res.ok || res.status === 202) {
      submitted += batch.length;
      console.log(`[indexnow] ${batch.length} URL soumises (HTTP ${res.status}).`);
    } else {
      console.warn(`[indexnow] Refus HTTP ${res.status} : ${(await res.text()).slice(0, 200)}`);
    }
  } catch (err) {
    console.warn(`[indexnow] Échec réseau : ${err.message}`);
  }
}

console.log(`[indexnow] Terminé — ${submitted}/${urls.length} URL soumises pour ${host}.`);
// Jamais bloquant : l'indexation est un bonus, pas une condition de déploiement.
process.exit(0);
