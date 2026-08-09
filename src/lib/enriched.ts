/**
 * Contenu éditorial généré par IA (scripts/enrich.mjs), chargé s'il existe.
 *
 * Le site est complet et publiable SANS aucun enrichissement : la couche IA
 * ajoute de la profondeur, elle ne conditionne pas la mise en ligne. Ça évite
 * de dépendre d'un quota d'API gratuit pour que le site fonctionne.
 */
export interface Enrichment {
  slug: string;
  /** 2-3 phrases : à quoi sert vraiment ce logiciel, en langage clair. */
  summary?: string;
  /** Pour qui c'est un bon choix. */
  goodFor?: string;
  /** Limite ou contrainte honnête. Ce champ est ce qui rend la page crédible. */
  watchOut?: string;
  /** Notes de déploiement (dépendances, base de données, reverse proxy). */
  deployNotes?: string;
  model?: string;
  generatedAt?: string;
}

const modules = import.meta.glob<{ default: Enrichment }>('../../data/enriched/*.json', { eager: true });

const map = new Map<string, Enrichment>();
for (const [path, mod] of Object.entries(modules)) {
  const slug = path.split('/').pop()!.replace(/\.json$/, '');
  map.set(slug, { slug, ...(mod.default ?? (mod as unknown as Enrichment)) });
}

export const getEnrichment = (slug: string): Enrichment | undefined => map.get(slug);
export const enrichedCount = map.size;
