# SelfhostIndex

Un annuaire de logiciels auto-hébergés qui **note la santé réelle de chaque projet** (0–100), à
partir de l'activité mesurée de son dépôt : volume de commits, cadence de publication, tendance
récente, taille de la communauté.

**→ Si tu es Maxime et que tu veux juste lancer le truc : [ACCOUNTS.md](ACCOUNTS.md).**

---

## L'angle

Tous les annuaires listent ce qui *existe*. Aucun ne dit ce qui est *encore maintenu*. C'est
pourtant la seule question qui compte avant de passer un week-end à déployer un service : est-ce
qu'il recevra encore des correctifs de sécurité dans deux ans ?

Le nombre d'étoiles ne répond pas à ça — il est cumulatif et ne redescend jamais. Un projet à
30 000 étoiles sans commit depuis un an paraît plus attirant qu'un projet à 400 étoiles qui publie
chaque semaine, alors que c'est le mauvais choix. Le score inverse ce biais.

C'est aussi ce qui rend le site **défendable** : republier une base de données publique n'a aucune
valeur SEO (Google classe ça en contenu dupliqué et fait gagner la source). Le score, les
classements, les percentiles et les comparatifs sont calculés ici et n'existent nulle part ailleurs.

## Le modèle économique

L'audience qui cherche « self-hosted alternative to Notion » a besoin d'un serveur dans les 48 h.
Les programmes d'affiliation VPS payent **25 à 100 $ par inscription** — sans commune mesure avec
les 2–4 % d'Amazon. Le site vend donc de l'hébergement à des gens qui en cherchent, et rien d'autre.

Les éditeurs de logiciels **ne peuvent pas** payer pour être classés : le classement est produit
par un script au moment du build, à partir de données publiques. C'est une contrainte technique,
pas une promesse.

## Architecture

```
scripts/fetch-data.mjs    git clone --depth 1 du dataset amont (1 requête réseau)
scripts/build-index.mjs   normalise, calcule les scores, résout les alternatives, maille les liens
scripts/enrich.mjs        rédige les fiches via l'API gratuite Gemini, par lots, incrémental
scripts/indexnow.mjs      notifie Bing/Yandex des nouvelles URL

src/data/*.json           sortie du pipeline — VERSIONNÉE (c'est ce que Cloudflare construit)
data/enriched/*.json      contenu IA accumulé — VERSIONNÉ, ne jamais supprimer
data/alternatives-map.json  la carte SaaS -> auto-hébergé (seul fichier vraiment éditorial)

site.config.ts            LE seul fichier à modifier : domaine, analytics, identifiants d'affiliation
```

**2 345 pages** générées à chaque build :

| Type | Volume | Rôle |
|---|---|---|
| `/software/[slug]` | 1 347 | fiche produit, score détaillé, besoins serveur |
| `/compare/[a]-vs-[b]` | 800 | comparatifs — fort volume de recherche, faible concurrence |
| `/category/[slug]` | 84 | « best self-hosted X », classé par santé |
| `/alternatives/[saas]` | 58 | **les pages qui rapportent** — intention d'achat immédiate |
| licences, plateformes, pages fixes | ~56 | longue traîne et signaux de confiance |

## Commandes

```bash
npm run data      # récupère les données amont + reconstruit l'index
npm run enrich    # génère des fiches IA (nécessite GEMINI_API_KEY)
npm run build     # construit le site statique dans dist/
npm run dev       # serveur local sur http://localhost:4321
npm run pipeline  # la chaîne complète
```

## Ce qui tourne sans personne

Le workflow [`.github/workflows/refresh.yml`](.github/workflows/refresh.yml) s'exécute chaque jour
à 04h17 UTC : données fraîches → scores recalculés → 40 nouvelles fiches rédigées → build complet
(qui sert de garde-fou : si le build casse, rien n'est publié) → push → déploiement Cloudflare →
notification aux moteurs.

Le site grossit donc d'environ **1 200 fiches enrichies par mois** jusqu'à couvrir tout le
catalogue, puis continue de rafraîchir les scores indéfiniment.

## Coûts

| Poste | Fournisseur | Coût |
|---|---|---|
| Hébergement + bande passante | Cloudflare Workers (static assets) | 0 € (illimité) |
| CI/CD quotidien | GitHub Actions (dépôt public) | 0 € (illimité) |
| Rédaction IA | Google AI Studio, offre gratuite | 0 € |
| Analytics | Cloudflare Web Analytics | 0 € |
| Indexation | Search Console + IndexNow | 0 € |

Aucune carte bancaire n'est rattachée au projet. Un dépassement est structurellement impossible.

## Attentes réalistes

À dire clairement, parce que c'est ce qui détermine si le projet est abandonné trop tôt :

- **Mois 1–3** : Google indexe. Trafic proche de zéro. C'est normal et il n'y a rien à faire.
- **Mois 3–6** : les premières pages longue traîne se positionnent. Quelques centaines de
  visites/mois. C'est le moment de demander les programmes d'affiliation.
- **Mois 6–12** : si ça prend, quelques milliers de visites/mois et les premières commissions.
  Ordre de grandeur honnête : quelques dizaines d'euros par mois.
- **Au-delà** : ça compose, ou ça stagne. Un site programmatique sur trois décolle vraiment.

Ce n'est pas un revenu rapide. C'est un actif qui ne coûte rien à conserver et qui se met à jour
tout seul — sa valeur vient de là, pas d'un pic initial.

## Données amont

Métadonnées logicielles issues de
[awesome-selfhosted-data](https://github.com/awesome-selfhosted/awesome-selfhosted-data),
sous licence CC-BY-SA 3.0. Attribution et partage à l'identique respectés sur
[`/attribution`](src/pages/attribution.astro). Les scores, classements et analyses sont produits
ici et ne relèvent pas de cette licence.
