# Outils de vérification

Scripts qui pilotent **le vrai navigateur sur l'app réelle**, avec des
comptes jetables supprimés à la fin. Ils ne remplacent pas des tests
unitaires : ils vérifient ce que l'utilisateur vit, ce qu'aucun appel de
fonction ne prouve.

> ⚠️ **La leçon qui a motivé ce dossier.** Un premier test « de bout en
> bout » rejouait les appels RPC avec les bons paramètres — dont
> `p_views`, que le front n'envoie jamais. Il validait un chemin que
> personne n'emprunte, et il est passé au vert pendant qu'un défaut réel
> vivait en production. **Vérifier l'appelant, pas seulement la fonction
> appelée.**

## Mise en route

```bash
npm i puppeteer-core        # pilote le Chrome deja installe, aucun telechargement
node outils/e2e_reel.cjs
```

`lib_vn.cjs` lit les clés là où elles vivent déjà (le `.env.local` de la
PWA et celui du B2B) : **aucun secret n'est écrit ici**.

## Les scripts

| Fichier | Ce qu'il vérifie |
|---|---|
| `e2e_reel.cjs` | Le parcours complet en **production** : QR → inscription → dépôt → validation par le gérant → points crédités, bloqués 12 h. Compare aussi le tableau de bord à un calcul SQL indépendant. |
| `test_tiktok_vues.cjs` | Le barème TikTok aux vues (0025) : repli à 60, 5 000 vues → 410, **un chiffre sans source vérifiée ne paie pas**, plafond, bornes de saisie du gérant. |
| `test_sans_capture_partout.cjs` | Les 3 formats déposés **sans capture** (0028), le lien exigé pour reel/TikTok, et la consigne affichée au gérant selon le format. |
| `poser_cles_tiktok.cjs` | À lancer quand `C:\Users\stepp\tiktok-cles.txt` est rempli : pose les secrets TikTok côté Supabase et vérifie que la fonction cesse de répondre `not_configured`. |

## Pièges déjà payés, à ne pas repayer

- **L'API Management refuse `urllib` (Python) et renvoie parfois une page
  HTML** sous charge : passer par `curl`, et retenter en disant ce qui est
  revenu. `mgmt()` s'en charge.
- **Un `sys.exit()` dans un `finally` avale l'exception** : un test peut
  s'arrêter en route en s'affichant « au vert ».
- `get_club_stats` / `get_club_audience` sont `SECURITY DEFINER` +
  `owns_club()` : **muettes en SQL direct**. Les vérifier en lisant ce que
  le gérant voit, puis en comparant à un calcul indépendant.
- Aucun déclencheur ne crée `public.users` : un script qui insère
  directement doit créer la ligne, sinon la clé étrangère casse.
- Le déploiement Vercel prend ~1 min : un bundle vérifié juste après le
  push est encore l'ancien.
- **Ne jamais supprimer le compte `julien.steppe123@gmail.com`** dans un
  ménage : c'est un vrai compte. Les comptes de test sont en
  `e2e-…@viralnight.test`.
- ⚠️ **Ces scripts sont en CommonJS, le projet est en `"type": "module"`.**
  D'où l'extension **`.cjs`** : en `.js` ils meurent sur
  `require is not defined in ES module scope`. Écrits dans le scratchpad
  (sans `package.json`), ils n'avaient jamais été relancés depuis le dépôt.
  ⚠️ En CommonJS, `require("./lib_vn")` ne résout PAS un `.cjs` :
  l'extension doit être écrite en toutes lettres.
