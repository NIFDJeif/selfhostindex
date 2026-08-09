/**
 * SINGLE SOURCE OF TRUTH.
 * C'est le SEUL fichier que tu auras à modifier, une fois, au démarrage.
 * Tout le reste du site se reconfigure automatiquement à partir d'ici.
 */

export const site = {
  /** Nom de marque affiché partout. */
  name: 'SelfhostIndex',
  /** Domaine complet, SANS slash final. Change-le si tu achètes un vrai domaine. */
  url: 'https://selfhostindex.pages.dev',
  tagline: 'The health-scored directory of self-hosted software',
  description:
    'Find, compare and deploy self-hosted software. 1,400+ open-source apps scored on real maintenance activity, with hosting requirements and migration guides.',
  locale: 'en',
  /** Utilisé pour les mentions légales / RGPD / contact affiliation. */
  contactEmail: 'legoressel6@gmail.com',
  /** ID Cloudflare Web Analytics (gratuit). Laisser vide désactive proprement le script. */
  cloudflareAnalyticsToken: '',
  /**
   * Clé IndexNow. Le fichier public/<clé>.txt qui l'accompagne prouve à Bing
   * que tu contrôles le domaine — ne renomme ni ne supprime aucun des deux.
   */
  indexNowKey: '4dfd15b6a7c5e7c67987845e0f36efa7',
};

/**
 * PROGRAMMES D'AFFILIATION.
 * Remplace `ref` par ton identifiant une fois inscrit (cf. ACCOUNTS.md).
 * `enabled: false` => le bloc n'est pas affiché du tout, aucun lien mort.
 * Tant que tu n'as rien rempli, le site affiche des liens propres non-affiliés :
 * il reste 100 % fonctionnel et ne perd pas la confiance des visiteurs.
 */
export type Affiliate = {
  id: string;
  name: string;
  /** Ce que le visiteur obtient. Argument de vente, pas du remplissage. */
  offer: string;
  /** URL de base, sans paramètre de tracking. */
  url: string;
  /** Ton identifiant d'affilié. Vide = lien propre non tracké. */
  ref: string;
  /** Gabarit du lien final. {url} et {ref} sont substitués. */
  template: string;
  enabled: boolean;
  /** RAM minimum conseillée (Go) : sert au matching automatique app -> hébergeur. */
  fromRamGb: number;
  priceFrom: string;
  /** Commission indicative, pour ton suivi. Non affiché sur le site. */
  payoutNote: string;
};

export const affiliates: Affiliate[] = [
  {
    id: 'hetzner',
    name: 'Hetzner Cloud',
    offer: '€20 in free credit — 2 vCPU / 4 GB from €4.51/mo',
    url: 'https://www.hetzner.com/cloud',
    ref: '',
    template: 'https://hetzner.cloud/?ref={ref}',
    enabled: false,
    fromRamGb: 2,
    priceFrom: '€4.51/mo',
    payoutNote: '€10 commission après 20€ consommés par le filleul',
  },
  {
    id: 'digitalocean',
    name: 'DigitalOcean',
    offer: '$200 in free credit for 60 days',
    url: 'https://www.digitalocean.com/',
    ref: '',
    template: 'https://www.digitalocean.com/?refcode={ref}',
    enabled: false,
    fromRamGb: 1,
    priceFrom: '$4/mo',
    payoutNote: '25 à 100 $ par client payant (via Impact)',
  },
  {
    id: 'vultr',
    name: 'Vultr',
    offer: '$100 in free credit',
    url: 'https://www.vultr.com/',
    ref: '',
    template: 'https://www.vultr.com/?ref={ref}',
    enabled: false,
    fromRamGb: 1,
    priceFrom: '$2.50/mo',
    payoutNote: 'jusqu à 100 $ par inscription qualifiée',
  },
  {
    id: 'hostinger',
    name: 'Hostinger VPS',
    offer: 'Managed VPS with 1-click app templates',
    url: 'https://www.hostinger.com/vps-hosting',
    ref: '',
    template: 'https://hostinger.com?REFERRALCODE={ref}',
    enabled: false,
    fromRamGb: 4,
    priceFrom: '$4.99/mo',
    payoutNote: '60 % de la première commande',
  },
];

/** Construit l'URL finale : affiliée si configurée, propre sinon. */
export function affiliateUrl(a: Affiliate): string {
  if (!a.enabled || !a.ref) return a.url;
  return a.template.replace('{ref}', a.ref).replace('{url}', a.url);
}

/** Les hébergeurs actifs pertinents pour une app donnée, les moins chers d'abord. */
export function hostsFor(ramGb: number): Affiliate[] {
  return affiliates
    .filter((a) => a.enabled)
    .filter((a) => a.fromRamGb <= Math.max(ramGb, 1))
    .slice(0, 3);
}

export const hasAffiliates = affiliates.some((a) => a.enabled && a.ref);
