# ViralNight — PWA clubbeur

L'app côté client de ViralNight : le clubbeur scanne le QR du club, poste sa
story Instagram taguée, gagne des points, débloque des récompenses à retirer
au bar. Mobile-first, installable (PWA), pensée pour une ouverture à 1h du
matin.

**Stack** : Vite + JavaScript vanilla (zéro framework) · CSS sur-mesure avec
design tokens · Supabase (auth magic link, Postgres + RLS, Storage, Edge
Functions) · déploiement Vercel.

---

## Parcours

Landing (scan QR) → Onboarding (handle + email, palier auto) → Dashboard →
Poster ma story (instructions → détection → gain animé) → Récompenses (QR de
retrait) → Bonus vues (upload capture) → Profil.

L'app tourne en **mode démo** (données mockées, `src/lib/mock.js`) tant que
Supabase n'est pas configuré — pratique pour itérer le design.

---

## Installation

```bash
npm install
cp .env.example .env.local   # puis remplir les clés Supabase (optionnel en démo)
npm run dev                  # http://127.0.0.1:5174
```

Build de production :

```bash
npm run build
npm run preview
```

### Variables d'environnement (`.env.local`)

| Clé | Rôle |
|-----|------|
| `VITE_SUPABASE_URL` | URL du projet Supabase |
| `VITE_SUPABASE_ANON_KEY` | Clé anon (client) |

Les clés serveur (`SUPABASE_SERVICE_ROLE_KEY`) ne vivent que dans les Edge
Functions, jamais dans le client.

---

## Base de données

```bash
# Avec le CLI Supabase, à la racine du projet lié :
supabase db reset          # applique migrations + seed
# ou manuellement :
psql "$DATABASE_URL" -f supabase/migrations/0001_schema.sql
psql "$DATABASE_URL" -f supabase/seed.sql
```

- `supabase/migrations/0001_schema.sql` — 6 tables + Row Level Security
  (chaque clubbeur ne voit que ses données ; clubs & récompenses en lecture
  publique).
- `supabase/seed.sql` — club pilote **Mirage (Bruxelles)** + 4 récompenses.

### Edge Functions (stubs)

| Fonction | Rôle | État |
|----------|------|------|
| `assign-tier` | followers → palier ×1/×2/×4/×8, persiste sur `users` | lookup mocké |
| `verify-story` | webhook Instagram → crédite base × multiplicateur | webhook simulé |
| `ocr-screenshot` | lit les vues sur la capture → crédite le bonus | OCR mocké |

```bash
supabase functions deploy assign-tier verify-story ocr-screenshot
```

Chaque `TODO(prod)` marque le point exact où brancher les vraies API.

---

## Direction artistique

Noir profond `#0A0A0B`, un seul accent (corail `#ff6363`, la marque
ViralNight), typo Inter + JetBrains Mono pour les chiffres. Grain de film,
halos corail comme des projecteurs — jamais de dégradé multicolore. Coins
arrondis, boutons avec états pressed, transitions d'écran en slide, compteurs
animés, retour haptique (Vibration API) désactivable dans le profil.

Tokens dans `src/styles/tokens.css`.

---

## Structure

```
src/
  main.js              entry + routing
  lib/                 router, dom, animations, haptics, supabase, mock
  components/          Button, TierBadge, PointsCounter, RewardCard
  pages/               landing, onboarding, dashboard, post-story,
                       rewards, bonus, profile
  styles/              tokens + un fichier par écran
supabase/
  migrations/          schéma + RLS
  functions/           assign-tier, verify-story, ocr-screenshot
  seed.sql             club Mirage + récompenses
public/                manifest, sw, icônes PWA
```

---

## À finaliser avant prod

- Brancher les vraies API dans les 3 Edge Functions (`TODO(prod)`).
- Câbler l'auth magic link réelle dans l'onboarding (`src/lib/supabase.js`).
- Vérifier le webhook Instagram (signature) dans `verify-story`.
- Remplacer les icônes PWA par le vrai logo (placeholder losange corail).
