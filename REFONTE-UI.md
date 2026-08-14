# Refonte UI/UX — PWA clubbeur ViralNight

> **Document de reprise.** Tout ce qui a été fait, décidé et découvert
> le 2026-08-14, et ce qu'il reste à faire. À lire en entier avant de
> toucher au code.

**Branche : `refonte-ui`** (créée depuis `main`). Rien n'est commité,
rien n'est poussé, rien n'est déployé. `npm run build` passe.

---

## 0. Le contexte

Julien : « le design actuel a été généré via GPT/Codex et ne me convient
pas du tout ». Refonte complète de l'UI/UX, à zéro.

**Contraintes posées par lui :**
- Rester sur **Vite + JS vanilla**, aucun framework ajouté.
- Garder la PWA installable et le comportement hors ligne.
- **Ne pas casser les appels Supabase** (RLS, auth, RPC, Realtime) —
  c'est une refonte visuelle et UX, pas une réécriture métier.
- Mobile-first obligatoire, utilisable sur desktop pour les tests.

**Board de direction validé** (palette, typo, kit de composants,
maquettes) :
https://claude.ai/code/artifact/51df0fe7-6717-4293-b977-2d53cfee1e5f

---

## 1. Les décisions produit de Julien (à ne pas re-litiger)

### 1.1 Tout en rouge enseigne, pas de seconde couleur

J'avais proposé un or `#FFC24B` pour les points. Réponse : **« oui mets
rouge enseigne »**. Donc une seule teinte vive.

La hiérarchie ne passe donc **pas par la teinte mais par la masse**,
en trois rôles à ne jamais mélanger :

| Jeton | Rôle | Usage |
|---|---|---|
| `--vn-red` `#ff2f45` | **APLAT** | fond plein + texte blanc. L'action principale. **UN SEUL PAR ÉCRAN.** |
| `--vn-red-ink` `#ff6070` | **ENCRE** | texte rouge sur fond sombre. Points, gains, jauges. **Jamais un fond.** |
| `--vn-red-tint` (13 %) | **TEINTE** | états, pastilles, carte débloquable. |

C'était le vrai défaut de la version précédente : le rouge y était en
aplat **partout** (marque, boutons, streak, défis, badges, jauges, et
même `--success`), donc rien ne dominait. Le problème n'était pas la
teinte, c'était qu'elle n'avait **qu'une seule intensité**.

⚠️ **Interdits de palette, hérités et confirmés :**
- **Pas de vert**, nulle part — le lime `#c8ff2f` a été rejeté le
  2026-08-07 (« le vert dégueulasse »). Les succès prennent l'aplat rouge.
- **Pas de fond violet** — il faisait virer le rouge au brun. Le noir
  reste neutre, avec une pointe de **froid** (`--vn-ink #08090c`), qui
  elle fait ressortir le rouge.
- **Le refus n'est pas rouge.** Le rouge est la couleur de marque : s'en
  servir pour dire « non » le rendrait ambigu partout. Un refus est
  **gris**, avec son motif écrit en toutes lettres.
- Le dégradé Instagram (`--vn-grad-ig`) est la couleur d'une marque
  tierce : **uniquement** sur le bouton « Continuer avec Instagram ».

### 1.2 Barème au forfait — les vues ne comptent plus

Julien : **« supprime le bonus vues, on ne se base plus sur les vues pour
le contenu »**.

Nouveau barème choisi : **Story = 100, Reel = 60, TikTok = 60**, point
final. La capture ne prouve plus que la publication.

✅ **MIGRATION `0020_bareme_forfait.sql` APPLIQUÉE EN PRODUCTION**
le 2026-08-14, sur accord explicite de Julien (« APPLIQUEZ »).
Vérifié après coup : `story_points('story', 999999)` = **100**, et le verrou
sur `credit_story` est toujours en place. Ce qu'elle touche :

- `story_points(p_kind, p_views)` (migration 0014) — le `CASE` qui
  calcule `socle + least((views/100) * taux, 2000)`.
- `submit_story()` — lève `views_required` si `p_views` est null.
- `review_story()` — fait `coalesce(p_views, extracted_views)`.

**Conséquences en cascade, à trancher avec Julien :**
1. Les badges **`views_10k`** et **`views_50k`** (migration 0017)
   deviennent indébloquables : plus aucune vue n'est enregistrée. Il
   faut les remplacer par des cibles sur le nombre de contenus ou le
   streak.
2. `get_club_proof()` (migration 0013) alimente la **preuve chiffrée de
   l'accueil** (« X vues générées ce mois-ci ») : elle perd sa source.
   Elle devient un compte de contenus, ou elle saute.
3. L'edge function **`ocr-screenshot` n'a plus d'objet** — donc la
   dépendance à OpenAI disparaît, ce qui règle au passage le problème
   des crédits à zéro.
4. La console gérant (`review.js`, `stats.js`) affiche et vérifie des
   vues : à revoir.
5. `story_events.views` et `view_claims.extracted_views` : **garder les
   colonnes** (données historiques réelles), simplement cesser de s'en
   servir.

### 1.3 La console gérant entre dans la refonte

`/owner.html` + `src/owner/` vivent dans **ce** repo (pas dans le repo
B2B). Julien a choisi de les refondre **en même temps**, pour qu'elles
partagent le même socle.

⚠️ Le dashboard B2B (`01-base-fonctionnelle-vite-supabase-api`) est un
**autre repo** et n'est **pas** concerné.

---

## 2. L'inventaire des écrans (état des lieux au départ)

| # | Écran | Fichier | État |
|---|---|---|---|
| 1 | Landing (vitrine post-scan QR) | `pages/landing.js` | ✅ **migré** |
| 2 | Onboarding (TikTok/IG/email → pseudo) | `pages/onboarding.js` | ✅ **migré** |
| 3 | Dashboard | `pages/dashboard.js` | ✅ **migré** |
| 4 | Poster un contenu | `pages/post-story.js` | ✅ **migré** |
| 5 | Boutique | `pages/rewards.js` | ✅ **migré** |
| 6 | Classement hebdo | `pages/leaderboard.js` | ✅ **migré** |
| 7 | Collection (badges) | `pages/collection.js` | ✅ **migré** |
| 8 | Profil | `pages/profile.js` | ✅ **migré** |
| 9 | ~~Bonus vues~~ | ~~`pages/bonus.js`~~ | 🗑️ **supprimé** |
| 10 | Console gérant | `owner.html` + `src/owner/` | ✅ **migrée** |

⚠️ **Il n'y a pas de scanner QR dans l'app.** Le QR est physique, il
ouvre l'URL avec un slug (`?c=mirage-brussels`). Le seul QR généré par
l'app est le ticket de retrait de la boutique.

---

## 3. Le diagnostic (chiffres mesurés dans le repo, pas des impressions)

| Mesure | Constat |
|---|---|
| **3 584** lignes de CSS | une feuille par page, préfixée par page (`lp-`, `ob-`, `db-`, `ps-`, `rw-`, `bn-`, `pf-`, `lb-`, `cl-`). Rien de partagé. |
| **7** en-têtes d'écran | `ob-head`, `ps-head`, `bn-head`, `lb-head`, `cl-head`, `rw-head`, `db-top`. Même rôle, 7 implémentations. |
| **4** barres de progression | `db-bar`, `rc-bar`, `cl-badge-bar`, `cl-overall`. 4 hauteurs, 4 couleurs de piste. |
| **5** champs de saisie dupliqués | avec 5 façons d'afficher l'erreur. |
| **5** messages « rien ici » | dont 2 servaient d'écran d'erreur. |
| **2 px** de rayon | hérité du site B2B — `tokens.css` l'assume. Fait lire « back-office » sur une app de soirée. |
| **10,5 px** de texte mini | libellés d'onglets. Illisible debout dans un bar. |
| **3** fichiers morts | `components/RewardCard.js` et `components/TierBadge.js` ne sont **importés nulle part** ; `lib/mock.js` non plus. |

⚠️ **`components/RewardCard.js` attendait `reward.cost` et `reward.desc`**
alors que la table `rewards` expose `cost_points` et `description`.
Branché tel quel, il aurait affiché « NaN pts ». C'est probablement pour
ça qu'il n'a jamais été importé et que la carte a été réécrite dans
`rewards.js`.

### ⚠️ Le piège des emprunts de classes entre pages

Certaines pages utilisent le CSS **d'une autre page** :

| Page | Emprunte | À |
|---|---|---|
| `profile.js` | `.bn-head` | `styles/bonus.css` |
| `rewards.js` *(avant migration)* | `.ps-foot` | `styles/post-story.css` |
| `leaderboard.js`, `collection.js` | `.rw-empty-msg` | `styles/rewards.css` |
| `post-story.js` | `.rw-check` | `styles/rewards.css` |

👉 **Supprimer une feuille « de page » casse une AUTRE page.** C'est
pour ça que `styles/rewards.css`, `styles/bonus.css` et
`styles/post-story.css` sont **encore chargés** dans `main.js` malgré la
migration de la boutique.

---

## 4. Ce qui a été construit

### 4.1 Le socle — `src/ui/`

⚠️ **TOUS les jetons sont préfixés `--vn-`, toutes les classes `.vn-`.**
Ce n'est pas de la coquetterie : l'ancien `styles/tokens.css` définit
déjà `--red`, `--r-card`, et surtout **`--red-ink` qui y vaut
`#ffffff`**. Sans préfixe, les deux systèmes se détruisent pendant la
migration.

| Fichier | Contenu |
|---|---|
| `tokens.css` | palette (3 masses de rouge), échelle typo (7 tailles, **plancher 12 px**), rayons **2 px → 18 px**, cibles tactiles 56 px, `--vn-tabbar-h`. |
| `type.css` | primitives `.vn-h1/.vn-h2/.vn-h3/.vn-label/.vn-meta/.vn-mono/.vn-sr`. **Aucun sélecteur global** → cohabite avec l'ancien `main.css`. |
| `reset.css` | ⚠️ **NE PAS l'importer depuis `ui/index.js`.** Il touche `body`, `*`, `button` et entrerait en collision avec `styles/main.css`. À charger **seulement** quand le dernier écran aura migré. |
| `index.js` | le barrel : importe `tokens.css` + `type.css`, réexporte tous les composants. |

**Composants** (chacun un `.js` + son `.css` co-localisé) :

| Composant | Remplace | Note |
|---|---|---|
| `Button` | `.btn/.btn-primary/.btn-block` recopiés partout | variants `primary` · `ghost` · `quiet` · `ig` · `tiktok`. `setLoading()` **garde le libellé** et ajoute un spinner — remplacer le texte par « Envoi… » faisait sauter la largeur du bouton sous le pouce. |
| `Card` | `.card` + cartes cliquables en `<div>` | rend un **`<button>`** dès qu'un `onClick` est fourni. Variantes `live` (teinte) et `flat`. |
| `Chips` | filtres boutique + sélecteur de format | rail **pleine largeur** (marges négatives) pour que la coupe soit franche. |
| `Field` | 5 champs dupliqués | libellé + champ + aide + erreur. **Chaque champ porte SA propre erreur.** |
| `Feedback` | 5 messages « rien ici » | `Empty`, `Skeleton`, `SkeletonText`. |
| `Picker` | 3 dépôts de capture différents | **montre l'image**, pas `IMG_4821.PNG`. Révoque ses URL d'objet. |
| `Points` | `PointsCounter` + ~10 `.mono` ad hoc | 4 tailles, `setValue()` animé, variante `off` (gris) pour un prix hors de portée. |
| `Progress` | 4 barres différentes | `aria-hidden` par défaut (doublon de la phrase qui suit). |
| `Sheet` | bottom sheet écrit à la main + 2 `alert()` | Échap, focus sur la 1ʳᵉ action, restitution du focus. |
| `State` | statuts écrits différemment par écran | `wait` · `ok` · `no` · `live`. **Jamais la couleur seule** : toujours un mot. |

### 4.2 Les patterns — `src/patterns/`

| Fichier | Rôle |
|---|---|
| `Screen.js/.css` | en-tête collant + corps + **pied collant dans la zone du pouce**. Remplace les 7 en-têtes. Exporte aussi `Title`, `Sub`, `Note`, `Section`, `Slot`. |
| `TabBar.js/.css` | remplace `components/TabBar.js` (supprimé). Libellés à **12 px** (contre 10,5). |
| `Rows.js/.css` | `Rows`, `Row` (ligne de contenu), `Tile` (tuile cliquable, vrai `<button>`). |
| `RewardCard.js/.css` | **la seule** carte de récompense, sur la vraie forme de données. Exporte `etatRecompense(r, balance)`. |

### 4.3 Écrans migrés

**`pages/dashboard.js`** + `pages/dashboard.css` (nouveau, ~130 lignes).
**`pages/rewards.js`** + `pages/rewards.css` (nouveau, ~90 lignes).

⚠️ `rewards.css` utilise le préfixe **`.shop-`**, volontairement
différent de `.rw-`/`.rc-` : `styles/rewards.css` est encore chargé pour
les trois écrans qui lui empruntent des classes.

### 4.4 Bugs réels corrigés en migrant

1. **Deux `alert()` dans la boutique.** L'un annonçait un échec
   d'échange, l'autre **donnait le code de retrait quand le ticket ne
   s'affichait pas**. Une fenêtre système grise, à 1 h du matin, pour
   l'information la plus importante du parcours. Remplacés par un
   message dans la feuille et un **écran de ticket dégradé** (le code
   reste lisible même si le QR échoue).
2. **Le QR était illisible.** `QRCode.toCanvas` était appelé avec
   `color: { dark: "#f7f5ff", light: "#00000000" }` — un QR **clair sur
   fond transparent**, donc sur du noir. Aucune douchette ni appareil
   photo ne lit ça de façon fiable. Passé en `dark: "#08090c"` sur
   `light: "#ffffff"`, dans un cartouche blanc plein.
3. **Un contenu en attente affichait `+0`.** L'écran d'envoi promet
   « tu le retrouveras dans Tes soirées, marqué en attente », mais
   `loadMyHistory()` ne récupérait pas `verified`, et un dépôt non
   validé a `awarded_points = 0` (migration 0014).
   👉 **Seul changement côté données de toute la session** : ajout de
   `verified` au `select` existant dans `lib/game.js`.
4. **Tuiles inatteignables au clavier** : `<div>` + `onclick` → `<button>`.

### 4.5 Défauts trouvés en regardant les captures (pas dans le code)

Vérification visuelle faite en headless (Chrome, cf. §7).

1. Les deux tuiles Classement/Collection avaient un pictogramme en rouge
   teinté → **deux taches rouges en haut d'écran** qui volaient la
   vedette au bouton d'action. Passées en neutre.
2. Le `pts` à `0.42em` faisait presque la taille du chiffre à 56 px →
   `0.3em`, opacité 0,6.
3. Sans club résolu, la **pastille rouge du club s'affichait seule**,
   sans nom à côté. Le bloc entier est maintenant `hidden` par défaut.
4. Le rail de filtres était **coupé net** par la marge de l'écran → il
   déborde jusqu'au bord (marges négatives compensées par le padding).

### ⚠️ 4.6 Le piège `[hidden]` — il est déjà revenu deux fois

`display: grid` / `display: inline-flex` **écrase** le `display: none`
que le navigateur applique à `[hidden]`. Il faut systématiquement :

```css
.mon-composant[hidden] { display: none; }
```

Présent dans `patterns/TabBar.css` (sinon la barre reste sur l'accueil et
masque « Commencer ») et dans `pages/dashboard.css` (`.db-club`).

---

## 5. Décisions déjà prises, pas encore exécutées

- **Supprimer `pages/bonus.js` + `styles/bonus.css`.** Écran complet
  mais **aucun bouton de l'app n'y mène** ; le dépôt de preuve vit dans
  `post-story.js`. ⚠️ **Avant de supprimer `bonus.css`, migrer
  `profile.js`** qui lui emprunte `.bn-head` (cf. §3).
- **Supprimer** `components/RewardCard.js`, `components/TierBadge.js`,
  `lib/mock.js` — code mort vérifié.
- **`post-story.js` est bloqué** par la migration du barème : le champ
  « vues » saute. Le reste de l'écran (capture obligatoire, pied fixe,
  gain annoncé) tient dans les deux cas.

---

## 6. État exact du dépôt

Branche `refonte-ui`, **rien de commité**.

```
 M index.html                     ← + police Archivo
 M src/lib/game.js                ← + `verified` dans loadMyHistory
 M src/main.js                    ← import ui/, TabBar depuis patterns/
 M src/pages/dashboard.js         ← réécrit
 M src/pages/rewards.js           ← réécrit
 M src/styles/gamification.css    ← bloc .db-* retiré (192 lignes)
 D src/components/TabBar.js       ← remplacé par patterns/TabBar.js
 D src/styles/dashboard.css       ← remplacé par pages/dashboard.css
?? src/pages/dashboard.css
?? src/pages/rewards.css
?? src/patterns/                  ← Screen, TabBar, Rows, RewardCard
?? src/ui/                        ← le socle (14 fichiers)
```

**8 fichiers suivis modifiés : +465 / −867 lignes.** `npm run build`
passe (bundle main : 51,4 kB JS / 16,6 kB gzip).

### Polices — `index.html`

Trois familles, trois rôles :
- **Archivo** — titres **ET** chiffres (grotesque large et lourde, en
  capitales). C'est elle qui porte le ton.
- **Inter** — texte courant.
- **JetBrains Mono** — ⚠️ **uniquement** le code de retrait qu'on lit à
  voix haute au barman. Il portait les chiffres avant, ce qui donnait un
  air de tableau de bord de dev.

---

## 7. Méthode de vérification visuelle (elle marche, la réutiliser)

Le routeur **ne lit pas l'URL**. Pour capturer un écran :

1. `sed -i 's/initial: "landing"/initial: "dashboard"/' src/main.js`
2. `npm run dev` (port **5174**)
3. Chrome headless :

```powershell
& "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --headless=new --disable-gpu --hide-scrollbars `
  --virtual-time-budget=7000 --window-size=900,880 `
  --user-data-dir=<UN DOSSIER DIFFÉRENT À CHAQUE APPEL> `
  --screenshot=<sortie.png> "http://127.0.0.1:5174/?c=mirage-brussels"
```

4. **Restaurer `initial: "landing"`** et arrêter le serveur.

⚠️ **Le `?c=mirage-brussels` est indispensable** : sans slug de club,
l'app affiche (correctement) ses états vides et on ne voit rien.
⚠️ **Capturer large (900 px)** : l'app s'affiche à 440 px centrée. Une
capture étroite est un **rognage**, pas un rendu mobile.
⚠️ **Un `--user-data-dir` différent à chaque appel**, sinon Chrome
n'écrit pas le fichier, en silence.

---

## 8. Ce qu'il reste à faire, dans l'ordre

1. **Écrire la migration SQL du barème forfait** et la soumettre à
   Julien. **Ne pas l'appliquer sans son accord explicite** — elle
   change l'économie en production. Trancher au passage les 5
   conséquences du §1.2.
2. **Migrer les écrans que le barème ne concerne pas** :
   ~~`leaderboard`~~ → ~~`collection`~~ → ~~`profile`~~ → ~~`landing`~~ → ~~`onboarding`~~
   → ~~`post-story`~~. **Toute la PWA est migrée.**
3. **Migrer `post-story`** une fois le barème tranché.
4. **Supprimer** `bonus.js` + `bonus.css` (après `profile.js`), puis les
   3 fichiers morts.
5. **Refondre `src/owner/`** sur le même socle.
6. **Bascule finale** : quand `main.js` n'importe plus aucune feuille de
   `styles/`, charger `ui/reset.css` à la place de `styles/main.css` et
   supprimer `styles/`.
7. Commit + push (⚠️ **le push déclenche le déploiement Vercel** — ne
   pas le faire sans l'accord de Julien).

---

## 8bis. Journal des migrations

### `leaderboard.js` — fait
- `styles/gamification.css` portait les règles `.lb-*` **en sélecteurs
  partagés** avec la collection (`.lb-inner, .cl-inner { ... }`). Il a fallu
  les réécrire en `.cl-` seul avant d'ouvrir `pages/leaderboard.css`.
- `patterns/Rows.js` : ajout d'un slot **`lead`** (remplace le pictogramme par
  un nœud libre) et d'un paramètre `class`. Le classement a besoin d'un rang
  **et** d'un avatar. Rétrocompatible.
- ⚠️ **Défaut corrigé dans `ui/Points.css`** : l'unité « pts » était un ratio
  `em`, donc **5 px** dans les lignes de classement — sous le plancher de
  12 px. Le ratio est faux dans les deux sens ; c'est maintenant une taille
  **absolue** par taille de chiffre (12 / 14 / 17 px).
- Non vérifié visuellement faute de données : le cas où **je suis dans le
  top 3** (`.lb-pod.is-me`, podium en teinte).

### `collection.js` — fait
- ⚠️ **`styles/gamification.css` SUPPRIMÉ.** Mais il contenait aussi
  l'overlay de célébration `.cbr`, utilisé par la **boutique** : ces règles
  sont parties dans **`patterns/Celebration.css`**, importé par
  `lib/celebrate.js`. Le dégradé rouge→orange du burst et le confetti orange
  ont été retirés — c'était une seconde teinte.
- **Badges en pause** : `views_10k` / `views_50k` ne peuvent plus avancer
  (barème forfait). Ils ne sont **pas supprimés** mais isolés dans une section
  « En pause », atténués, **sans jauge ni compteur**. Ils sont aussi **sortis
  du dénominateur** de l'avancement global : une barre qui ne peut pas
  atteindre 100 % est une promesse cassée.
- ⚠️ **Bug attrapé à la capture** : `[...enCours, ...obtenus].map(ligne)` —
  `Array.map` passe l'**index** en 2ᵉ argument, qui atterrissait dans le
  paramètre `pause`. Tous les badges sauf le premier s'affichaient « En
  pause ». **Toujours envelopper : `.map((b) => ligne(b))`.**
- Pas de `Card` pour la ligne de badge : `.vn-card` impose
  `flex-direction: column` et la ligne est horizontale. Mêmes spécificités,
  donc le gagnant aurait dépendu de l'ordre de chargement.

### `profile.js` — fait, et **bonus supprimé**
- ⚠️ **BUG DE FOND : « Se déconnecter » ne déconnectait pas.** Le bouton
  appelait seulement `ctx.navigate("landing")` ; la session Supabase restait
  ouverte et l'accueil reconnectait aussitôt. Sur un téléphone prêté, c'est le
  compte de quelqu'un d'autre qui reste accessible. `signOut()` existait dans
  `lib/session.js` et **n'était appelé nulle part**. Corrigé.
- La déconnexion **n'est pas dans le pied collé** : le pied est la zone du
  pouce, réservée à l'action principale — et le profil n'en a pas. Y épingler
  la seule action destructive de l'app en ferait la plus facile à toucher par
  erreur.
- Le **dégradé Instagram a quitté l'avatar** : tout le monde ne s'est pas
  connecté par Instagram (TikTok, e-mail). Il ne reste que sur le bouton de
  connexion.
- La ligne **entière** d'un réglage est le bouton (56 px), au lieu du seul
  interrupteur de 30 px.
- Le club était affiché **deux fois** (sous le pseudo et dans les réglages) —
  la ligne des réglages a sauté.
- 🗑️ Supprimés : `pages/bonus.js`, `styles/bonus.css`, `styles/profile.css`,
  la route `bonus` et ses imports dans `main.js`.

**Feuilles `styles/` restantes** (3 écrans non migrés) : `landing.css`,
`onboarding.css`, `post-story.css`, plus `main.css`, `tokens.css`,
`screens.css`, `components.css` et `rewards.css` — cette dernière uniquement
parce que `post-story.js` lui emprunte encore `.rw-check`.

### `landing.js` — fait
- ⚠️ **LE BARÈME AFFICHÉ N'A PAS ÉTÉ PASSÉ AU FORFAIT.** La migration SQL
  n'étant pas appliquée, `story_points()` paie encore aux vues. Annoncer le
  forfait avant la base, ce serait promettre un montant que le club ne
  versera pas.
- **`lib/bareme.js` gagne trois exports** pour que la bascule soit
  automatique le jour venu : `AU_FORFAIT` (dérivé de `per100`),
  `phraseBareme(kind)` et `promesseCourte()`. Toutes les phrases de l'app en
  découlent. **Le jour de la migration, il suffit de mettre `per100: 0` dans
  `BAREME` et tous les écrans suivent.**
- La récompense **la plus accessible passe de l'aplat rouge plein à la
  teinte**. Avec le bouton « Commencer » en aplat juste dessous, deux blocs
  pleins se disputaient l'œil sur l'écran le plus important du produit.
  ⚠️ L'aplat plein avait été validé par Julien le 2026-08-08 — c'est un
  changement volontaire, facile à annuler s'il le préfère.
- Les deux états sont vérifiés : avec QR (`?c=mirage-brussels`) et **sans
  QR** (« Scanne le QR de ton club »).
- 🗑️ `styles/landing.css` supprimé.

### `onboarding.js` — fait
- ⚠️ **`styles/onboarding.css` N'A PAS ÉTÉ SUPPRIMÉ**, il a été **réduit à
  quatre classes** : `.ob-input`, `.ob-back`, `.ob-note`, `.ob-msg`. C'est
  tout ce que `post-story.js` lui emprunte encore. Le supprimer ferait
  perdre d'un coup le style de son champ de saisie, de sa flèche retour et
  de ses messages. **À supprimer avec la migration de post-story.**
- Pour que les deux feuilles cohabitent, le message du nouvel écran
  s'appelle **`.ob-alert`**, pas `.ob-msg`.
- Chaque champ porte **sa propre erreur** (`Field.setError`). Un seul
  `<p class="ob-msg">` était partagé : une erreur sur le nombre d'abonnés
  s'affichait sous le champ du pseudo.
- La capture de profil passe sur `Picker`, qui **montre l'image**.
- Les deux états sont vérifiés. ⚠️ L'étape « connexion » a dû être **forcée
  en local** (une session de démo existe sur ce poste, donc l'écran saute
  directement au pseudo) : sauvegarde du fichier, `const s = null;`,
  capture, restauration. Rien écrit en base.

## 8ter. La migration du barème — écrite, PAS appliquée

`supabase/migrations/0020_bareme_forfait.sql`

**Story 100 · Reel 60 · TikTok 60.** Ce sont exactement les socles actuels :
personne ne perd son socle, on retire seulement le bonus indexé sur les vues.

### Choix d'implémentation
- **Signatures inchangées.** `p_views` est conservé partout et devient
  décoratif. Changer une signature impose un `drop function`, casse les
  clients déjà déployés et fait perdre les droits.
- ⚠️ `story_events.views` est **NOT NULL DEFAULT 0** (migration 0012) : on ne
  peut pas y écrire NULL. Un dépôt sans chiffre stocke donc 0.
- ⚠️ **Le verrou de la 0014 est reposé explicitement.** C'est exactement là
  que la 0016 avait fait sauter la révocation de `credit_story` en silence.
- ⚠️ `on conflict (user_id, club_id, week_start_date)` — vérifié contre la
  clé primaire de `leaderboard_entries` (0002). **Pas `week`**, c'est le bug
  42703 de la 0016.

### ⚠️ Changement de pouvoir pour le gérant
Avant, il pouvait corriger le nombre de vues, donc **fixer le montant versé**.
Au forfait, `p_views` n'a plus aucun effet sur le gain : il lui reste la seule
décision qui compte, valider ou refuser. **À dire à Julien avant d'appliquer.**

### Ordre de déploiement — il compte
1. Appliquer la migration.
2. **Puis seulement** mettre `per100: 0` dans `src/lib/bareme.js`.

L'inverse annoncerait le forfait pendant que la base paie encore aux vues.
Entre les deux, le clubbeur touche moins que promis — fenêtre courte, le temps
d'un déploiement.

### Ce que la migration ne fait pas, volontairement
1. ✅ **Badges de vues REMPLACÉS** — migration `0021_badges_atteignables.sql`,
   appliquée le 2026-08-14 sur décision de Julien. `views_10k` → `streak_10`
   (« Dix d'affilée »), `views_50k` → `stories_50` (« Pilier », 50 contenus).
   ⚠️ Vérifié avant suppression : **zéro détenteur** pour les deux. C'est la
   condition qui rendait le remplacement anodin.
2. **`get_club_proof` non touchée en SQL** — mais la landing affiche désormais
   le nombre de **contenus** et non le total de vues, qui a cessé de grandir.
   Le « meilleur gain » a sauté : au forfait, la meilleure soirée vaut 100 pts
   comme toutes les autres, ça ne distingue plus rien.
3. ✅ **`credit_story` : vérifiée, rien à faire.** Contrairement à ce que
   j'avais écrit, elle appelle déjà `story_points()`.
4. **Aucune donnée historique recalculée.**

Le fichier se termine par un bloc de requêtes de vérification à lancer après
application.

## 8quater. Le barème forfait est EN PRODUCTION (2026-08-14)

Appliqué via l'API Management Supabase (projet `gcopwgmqjiufemapamek`).
**Story 100 · Reel 60 · TikTok 60**, quel que soit le nombre de vues.

### Vérifié après application
| Contrôle | Résultat |
|---|---|
| `story_points('story', 0)` / `('story', 999999)` | **100 / 100** |
| `story_points('reel', 50000)` / `('tiktok', 0)` | **60 / 60** |
| `story_points('bidon', 0)` | **NULL** (les appelants lèvent) |
| Droits `credit_story` pour anon/authenticated | **aucun — verrou en place** |
| `submit_story` lève encore `views_required` | **non** |
| `submit_story` lève `proof_required` / `already_pending` | **oui / oui** |

⚠️ Piège de vérification : `prosrc like '%views_required%'` renvoie **true**
à cause d'un **commentaire** dans le corps de la fonction. Tester
`'%raise exception ''views_required''%'`.

### Le client a suivi, dans le bon ordre
1. `lib/bareme.js` → `per100: 0` partout.
2. `landing.js` a basculé **tout seul** (`phraseBareme`, `promesseCourte`,
   `AU_FORFAIT`) — l'intitulé de l'étape 2 passe de « On compte tes vues » à
   « Le club valide ».
3. **`post-story.js`** (pas encore migré sur le socle, mais corrigé pour ne
   pas mentir) : le champ **« Combien de vues ? » est supprimé**, le bouton ne
   dépend plus que de la capture, et la copie vient de `phraseBareme()`.
   Le garder « facultatif » aurait été pire : demander un effort pour une
   donnée qu'on jette.
4. **`src/owner/sections/review.js`** : contenait une **quatrième copie du
   barème en dur**. Branchée sur `lib/bareme.js`. Le champ « vues » reste,
   étiqueté *(pour info)*, et **ne recalcule plus l'aperçu du crédit** —
   le laisser réagir donnerait au gérant l'illusion qu'il fixe encore le
   montant.

### Reste ouvert
- ✅ Badges de vues remplacés (migration 0021). La section « En pause » de
  `collection.js` reste en place comme filet, mais plus aucun badge ne la
  déclenche.
- `get_club_proof` : le total de vues cesse de grandir, la landing l'affiche
  encore pour le passé.
- ✅ `credit_story` : **rien à faire.** J'avais écrit qu'elle gardait un barème
  aux vues en dur — **c'était faux**. Sa définition en base (relue le
  2026-08-14) appelle déjà `story_points()`, donc elle a basculé au forfait
  avec le reste. Elle reste révoquée et sans appelant.
- L'OCR (`ocr-screenshot`) n'a plus d'objet : il lit un chiffre qui ne sert
  plus à rien.

## 8quinquies. `post-story.js` migré — et la BASCULE FINALE est faite

### L'écran
- Le **gain est annoncé avant** de partir poster : au forfait c'est un chiffre
  unique, autant le montrer.
- ⚠️ Le champ « Combien de vues ? » a disparu (migration 0020). Le garder
  « facultatif » aurait été pire : demander un effort pour une donnée qu'on
  jette.
- La capture passe sur `Picker` — elle **montre l'image**.
- Le pseudo du club garde ses minuscules dans un titre en capitales
  (`.ps-club { text-transform: none }`) : « @MIRAGE.BRUSSELS » ne ressemble
  plus au compte qu'on demande d'aller taguer.
- `.vn-screen__title em` → **encre rouge, jamais italique**. Sans la règle,
  `<em>` retombait sur l'italique du navigateur : rouge et droit sur
  l'accueil, blanc et penché sur « Poster ». Archivo n'a pas d'italique, donc
  le navigateur en **synthétisait** un.

### ⚠️ La bascule finale — `styles/` est mort (sauf un fichier)
- `ui/index.js` importe maintenant **aussi** `reset.css` et le nouveau
  **`ui/shell.css`** (`.noise`, `.app-viewport`, `.screen`, transitions du
  routeur), qui remplacent `styles/main.css` et `styles/screens.css`.
- `index.html` **ne charge plus aucune feuille en dur** : tout passe par le
  JS, Vite regroupe.
- `main.js` n'a plus un seul `import "./styles/..."`.
- 🗑️ Supprimés : `main.css`, `screens.css`, `components.css`,
  `onboarding.css`, `post-story.css`, `rewards.css`.
- ⚠️ **`src/styles/tokens.css` SURVIT** — `owner.html` le charge en direct
  (`<link rel="stylesheet" href="/src/styles/tokens.css">`) et `owner.css`
  utilise les anciens jetons (`--accent`, `--bg`…). **Le supprimer casse la
  console gérant.** Il part avec sa migration.
- `theme-color` et le manifest passent à `#08090c`.

### Résultat
**CSS du bundle : 60,2 kB → 36,3 kB** (11,5 → 7,0 gzip), et les
**quatre emprunts de classes entre pages ont disparu**.

### Piège de vérification visuelle (m'a coûté un aller-retour)
Une capture prise juste après une modification CSS peut être **antérieure au
rechargement du serveur de dev**. J'ai cru à un bug de cascade alors que le
DOM et le CSS étaient corrects tous les deux — vérifié au `--dump-dom`. En
cas de doute : redémarrer le serveur, attendre, recapturer.

## 8sexies. Console gérant migrée — LE CHANTIER EST TERMINÉ

### Approche : rebrancher, pas réécrire
787 lignes de CSS sur ~25 anciens jetons, et 1 172 lignes de sections. Les
sections gardent leur balisage `.ow-*` ; c'est **`owner.css` qui a changé de
vocabulaire**. Renommage systématique vers les `--vn-*`, puis passe sur la
géométrie et la typo. **Zéro ancien jeton restant** (vérifié par regex).

Décisions prises pendant le renommage :
- `--cyan` (catégorie « boisson », état « à venir ») → **gris de texte**.
  Le produit tient sur une seule teinte.
- `--grad-fresh` (dégradé rouge→orange) → **aplat rouge**. L'orange était
  une seconde teinte.
- `rgba(var(--accent-rgb), …)` → le socle n'expose pas de triplet RGB :
  remplacé par `--vn-red-tint` / `--vn-red-edge` / un littéral.
- Rayons `3px → var(--vn-radius-btn)`, `4px → --vn-radius-card`.
- Plancher typo à 12 px, comme la PWA.
- **La densité reste plus élevée** (corps à 14 px contre 16) : ce n'est pas
  le même geste. Le clubbeur est debout, une main prise ; le gérant est
  assis et enchaîne les validations.

### 🗑️ `src/styles/` N'EXISTE PLUS
La console était le dernier lecteur de `styles/tokens.css`. Supprimés aussi :
`src/components/` (`RewardCard.js`, `TierBadge.js`, `PointsCounter.js` — code
mort vérifié) et `src/lib/mock.js`.

`owner.html` ne charge plus aucune feuille : `src/owner/main.js` importe
`ui/tokens.css`, `ui/type.css`, `ui/reset.css` puis `owner.css`.
⚠️ **`ui/shell.css` n'est PAS importé côté console** : il porte
`.app-viewport` et `.screen`, qui n'existent que dans la PWA.

### Défaut trouvé à la capture
La pastille de compteur « À valider » s'affichait en **rond rouge plein quand
la file était vide** — elle criait qu'il y avait quelque chose à faire alors
qu'il n'y avait rien. `[hidden]` ne suffisait pas : le code écrit parfois une
chaîne vide au lieu de poser l'attribut. Ajout de `.ow-badge:empty`.

### ⚠️ Ce qui n'a PAS été vérifié visuellement
Les **six sections** (Boutique, Défis, QR, Statistiques, Paramètres, et le
détail d'À valider) demandent une session gérant. J'ai capturé la connexion
et le layout — ce dernier en **court-circuitant l'authentification en local**,
d'où l'erreur d'UUID à l'écran. Le fichier a été restauré et vérifié.
👉 À regarder par Julien après `npm run dev` + `/owner.html`.

## 9. Règles de style à tenir (elles viennent de lui)

- **Livrer franc du collier** : Julien ne voit pas les changements
  subtils. Un écart de 13 % d'opacité ne compte pas comme un changement.
- **Pas de livrable « méta »**, pas de texte long : le rendu réel,
  très visuel.
- **Vérifier avant d'affirmer** : ne jamais annoncer une contrainte
  technique de mémoire, la sourcer dans le code.
- **Un état vide honnête vaut mieux qu'un chiffre faux mais crédible.**
  Règle déjà appliquée dans tout le code : jamais de valeur de
  démonstration en attendant la vraie réponse (le dashboard affichait
  480 pts pendant que la boutique lisait le vrai solde).
