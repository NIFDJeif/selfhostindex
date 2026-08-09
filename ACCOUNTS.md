# Ce que tu dois faire — une seule fois, ~90 minutes

Tout le reste tourne sans toi. Fais les étapes **dans l'ordre** : chacune dépend de la précédente.

Aucune carte bancaire n'est demandée à aucune étape. Si un service t'en réclame une, c'est que tu
n'es pas sur la bonne offre — arrête-toi et vérifie.

---

## Étape 1 — GitHub (10 min) · héberge le code et fait tourner l'automatisation

1. Crée un compte : **https://github.com/signup**
2. Crée un dépôt : **https://github.com/new**
   - Nom : `selfhostindex`
   - Visibilité : **Public** ← important
   - Ne coche **rien** d'autre (pas de README, pas de .gitignore)

> **Pourquoi public ?** Sur un dépôt privé, GitHub Actions est limité à 2 000 minutes/mois.
> Sur un dépôt public, c'est **illimité et gratuit à vie**. Le code n'a rien de secret : la valeur
> du projet est dans le domaine et l'antériorité SEO, pas dans le code. La clé API, elle, ne sera
> jamais dans le code (voir étape 4).

3. Envoie le projet (copie-colle ce bloc en remplaçant `TON-PSEUDO`) :

```bash
cd "C:/Users/maxim/Desktop/usine à argent" && git remote add origin https://github.com/TON-PSEUDO/selfhostindex.git && git branch -M main && git push -u origin main
```

---

## Étape 2 — Cloudflare Pages (15 min) · héberge le site

1. Crée un compte : **https://dash.cloudflare.com/sign-up**
2. Menu de gauche → **Compute (Workers & Pages)** → **Create** → onglet **Pages** →
   **Connect to Git** → autorise GitHub → choisis le dépôt `selfhostindex`
3. Renseigne **exactement** ceci :

   | Champ | Valeur |
   |---|---|
   | Framework preset | `Astro` |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | *(laisser vide)* |

4. **Save and Deploy**. Compte 3 à 5 minutes pour le premier build.
5. Note l'URL obtenue, du type `selfhostindex-a1b.pages.dev`.

### 2b. Si l'URL n'est PAS exactement `selfhostindex.pages.dev`

Ouvre `site.config.ts`, ligne ~13, et remplace par ton URL réelle :

```ts
url: 'https://selfhostindex-a1b.pages.dev',
```

C'est **indispensable** : cette valeur alimente le sitemap, les URL canoniques et les données
structurées. Une URL fausse ici et Google indexe des adresses qui n'existent pas.

Puis :

```bash
git add site.config.ts && git commit -m "config: set live URL" && git push
```

> **Bande passante illimitée, gratuite, pour toujours.** C'est l'offre Cloudflare Pages.
> Même si le site prend 500 000 visites/mois, tu paieras 0 €.

---

## Étape 3 — Cloudflare Web Analytics (5 min) · savoir ce qui rapporte

Sans mesure, tu ne sauras jamais quelles pages rapportent, donc quoi développer.

1. Dashboard Cloudflare → **Analytics & Logs** → **Web Analytics** → **Add a site**
2. Saisis ton domaine `.pages.dev`
3. Copie le **token** (une longue chaîne hexadécimale)
4. Colle-le dans `site.config.ts` :

```ts
cloudflareAnalyticsToken: 'colle-le-token-ici',
```

```bash
git add site.config.ts && git commit -m "config: enable analytics" && git push
```

> Sans cookies, sans bandeau de consentement, conforme RGPD. C'est déjà écrit dans la page
> `/privacy`, qui se met à jour toute seule selon que ce champ est rempli ou non.

---

## Étape 4 — Clé API Gemini (5 min) · le rédacteur automatique

C'est ce qui écrit 40 nouvelles fiches éditoriales par jour, gratuitement.

1. Va sur **https://aistudio.google.com/apikey** (connexion avec ton compte Google)
2. **Create API key** → copie la clé
3. Sur GitHub : ton dépôt → **Settings** → **Secrets and variables** → **Actions** →
   **New repository secret**
   - Name : `GEMINI_API_KEY`  ← respecte la casse exactement
   - Secret : colle la clé
4. **Add secret**

> **Vérifie que tu es bien sur l'offre gratuite** (« Free tier » dans AI Studio). Aucune carte
> n'est requise. Le script s'arrête net dès qu'il reçoit un code 429 (quota atteint) et reprend
> le lendemain — un dépassement facturé est donc impossible.

### Lance la première exécution

Dépôt → onglet **Actions** → *Refresh data, enrich and deploy* → **Run workflow**.

Compte ~10 minutes. À la fin, tu dois voir un nouveau commit `data: refresh scores, +40 enriched
entries`. À partir de là, ça tourne **tout seul chaque jour à 04h17 UTC**.

---

## Étape 5 — Google Search Console (15 min) · c'est ici que vient l'argent

Sans cette étape, Google mettra des mois à trouver le site. Avec, quelques jours.

1. **https://search.google.com/search-console** → **Ajouter une propriété** →
   choisis **Préfixe d'URL** (la case de droite) → saisis ton URL complète `https://....pages.dev`
2. Méthode de validation : **Fichier HTML**. Télécharge le fichier `googleXXXX.html` proposé.
3. Place ce fichier dans le dossier `public/` du projet, puis :

```bash
git add public/ && git commit -m "seo: google search console verification" && git push
```

4. Attends que Cloudflare redéploie (~3 min), puis clique **Valider** dans la Search Console.
5. Une fois validé : menu **Sitemaps** → saisis `sitemap-index.xml` → **Envoyer**.

> Tu viens de déclarer **2 345 pages** à Google d'un coup. L'indexation s'étale sur 2 à 8 semaines ;
> c'est normal et il n'y a rien à faire de plus.

---

## Étape 6 — Bing Webmaster Tools (5 min) · trafic bonus + active IndexNow

1. **https://www.bing.com/webmasters** → connexion → **Import from Google Search Console**
   (deux clics, tout est repris automatiquement)

> Ça active la validation IndexNow : le site notifie alors Bing/Yandex à chaque mise à jour.
> Bing représente peu de trafic, mais c'est 5 minutes pour un canal supplémentaire gratuit.

---

## Étape 7 — L'affiliation (30 min) · **c'est l'étape qui génère les revenus**

Les six étapes précédentes construisent l'audience. Celle-ci la convertit en argent.

**Ne fais pas cette étape maintenant.** Attends d'avoir **~200 visiteurs/mois** (visible dans
Cloudflare Web Analytics). La plupart des programmes refusent les sites sans trafic, et une
candidature refusée est difficile à représenter.

Quand tu y es, inscris-toi dans cet ordre de rentabilité :

| Programme | Où s'inscrire | Rémunération indicative |
|---|---|---|
| **DigitalOcean** | https://www.digitalocean.com/affiliates | 25–100 $ par client payant |
| **Vultr** | https://www.vultr.com/company/affiliate | jusqu'à 100 $ par inscription qualifiée |
| **Hetzner** | https://www.hetzner.com/cloud (parrainage depuis ton compte) | ~10 € par filleul actif |
| **Hostinger** | https://www.hostinger.com/affiliates | 60 % de la première commande |

Pour chacun, une fois accepté, ouvre `site.config.ts` et renseigne **deux champs** :

```ts
{
  id: 'digitalocean',
  ...
  ref: 'ton-code-ici',   // ← ton identifiant d'affilié
  enabled: true,         // ← passe à true
}
```

```bash
git add site.config.ts && git commit -m "money: enable digitalocean affiliate" && git push
```

Les blocs d'hébergement apparaissent alors sur les **2 345 pages** d'un coup, avec la mention
légale obligatoire et le `rel="sponsored"` requis par Google. Tant que `enabled` est à `false`,
le site affiche une information d'hébergement neutre et utile — il ne ressemble jamais à une
page vide en attente de pub.

---

## Ce que tu ne dois PAS faire

- **Ne touche à aucun fichier hors `site.config.ts`.** Tout le reste est régénéré automatiquement ;
  tes modifications seraient écrasées au prochain cycle.
- **Ne modifie pas les scores à la main.** Leur seule valeur est d'être calculés sans intervention.
  Le jour où tu en truques un, le site n'a plus de raison d'exister.
- **N'accepte aucune proposition de « post sponsorisé » d'un éditeur de logiciel.** C'est ce qui
  tue ce type de site : le classement doit rester incorruptible. Les hébergeurs payent, les
  logiciels classés ne payent jamais.

---

## L'unique dépense qui vaut le coup (facultative, ~10 €/an)

Un vrai domaine, du type `selfhostindex.com`, au lieu de `.pages.dev`.

**Pourquoi ça compte :** un sous-domaine `.pages.dev` est partagé par des millions de sites, dont
beaucoup de spam. Google traite ces domaines mutualisés avec méfiance, et tu ne pourras jamais
revendre le site sans posséder son domaine.

Si un jour tu veux le faire : achète-le chez **Cloudflare Registrar** (prix coûtant, sans marge),
puis Pages → **Custom domains** → ajoute-le. Il reste ensuite **une seule** ligne à changer,
`url:` dans `site.config.ts`, et tout le site se reconfigure.

Ce n'est pas nécessaire pour démarrer. Fais-le si le trafic décolle.

---

## Vérifier que la machine tourne

Une fois par mois, 2 minutes :

1. Dépôt GitHub → onglet **Actions** : les exécutions doivent être **vertes**.
   Une croix rouge = le site continue de fonctionner (il est statique), mais il ne se met plus
   à jour. La cause quasi certaine est une clé API expirée : refais l'étape 4.
2. Cloudflare Web Analytics : la courbe de visites doit monter.
3. Une fois l'affiliation active : les tableaux de bord des programmes, pour les commissions.
