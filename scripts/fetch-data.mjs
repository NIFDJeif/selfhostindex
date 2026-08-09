/**
 * Étape 1 du pipeline : récupérer la donnée brute.
 *
 * On clone en profondeur 1 plutôt que d'appeler l'API GitHub fichier par fichier :
 * 1 400 requêtes API dépasseraient le quota anonyme (60/h) dès la première exécution.
 * `git clone --depth 1` = 1 seule opération réseau, ~8 Mo, aucun token requis.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = resolve(ROOT, 'data/raw');
const REPO = 'https://github.com/awesome-selfhosted/awesome-selfhosted-data.git';

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts });
}

console.log('[fetch] Source : awesome-selfhosted-data (CC-BY-SA 3.0)');

if (existsSync(resolve(RAW, '.git'))) {
  // Déjà cloné (cas du cache CI) : on se contente d'un pull, c'est instantané.
  console.log('[fetch] Dépôt existant -> mise à jour incrémentale');
  try {
    run('git', ['-C', RAW, 'fetch', '--depth', '1', 'origin', 'HEAD']);
    run('git', ['-C', RAW, 'reset', '--hard', 'FETCH_HEAD']);
  } catch {
    console.warn('[fetch] Pull échoué, on repart d’un clone propre');
    rmSync(RAW, { recursive: true, force: true });
  }
}

if (!existsSync(resolve(RAW, '.git'))) {
  rmSync(RAW, { recursive: true, force: true });
  mkdirSync(dirname(RAW), { recursive: true });
  console.log('[fetch] Clonage (depth=1)...');
  run('git', ['clone', '--depth', '1', '--single-branch', REPO, RAW]);
}

// Empreinte de la version des données, pour tracer la fraîcheur sur le site.
const sha = execFileSync('git', ['-C', RAW, 'rev-parse', '--short', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const date = execFileSync('git', ['-C', RAW, 'log', '-1', '--format=%cI'], {
  encoding: 'utf8',
}).trim();

console.log(`[fetch] OK — commit ${sha} du ${date}`);
