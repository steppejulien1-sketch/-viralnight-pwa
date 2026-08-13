-- ============================================================
-- 0018 — Creation du profil clubbeur, et fermeture de la porte INSERT
-- ------------------------------------------------------------
-- DEUX PROBLEMES, UNE SEULE CAUSE : personne ne cree la ligne
-- `public.users`.
--
-- 1. FAILLE. La migration 0004 a ferme l'UPDATE apres qu'un PATCH a fait
--    passer un solde de 480 a 999999. Elle n'a PAS touche a l'INSERT.
--    Verifie sur la base de production :
--        authenticated | INSERT | TOUTES les colonnes
--        authenticated | UPDATE | email, handle
--    La policy "own profile - insert" autorise l'insertion de sa propre
--    ligne. Un nouvel inscrit pouvait donc se creer un profil avec
--    points_balance = 999999. Meme faille que la 0004, par l'autre verbe.
--    Exploitable une seule fois par compte -- mais TOUS les comptes
--    l'avaient ouverte, puisque aucun n'a de ligne au depart.
--
-- 2. L'INSCRIPTION N'A JAMAIS FONCTIONNE. Aucun trigger ne cree la ligne
--    a la creation du compte auth (verifie : zero occurrence dans les 17
--    migrations precedentes). `onboarding.js` fait un UPDATE, et
--    `declare_followers()` aussi : sur une ligne inexistante, les deux
--    touchent 0 ligne SANS lever d'erreur. Le pseudo etait perdu en
--    silence. Les comptes existants ont tous ete semes a la main, le
--    parcours reel n'avait jamais ete emprunte.
--
-- CHOIX : grant par colonne plutot qu'un trigger sur auth.users.
-- Le trigger creerait une ligne pour tout compte auth, y compris les
-- gerants (club_owners) qui ne sont pas des clubbeurs. Ici c'est
-- l'inscription qui cree sa ligne, quand elle a un pseudo a y mettre.
-- ============================================================

-- On repart d'une ardoise propre : le grant par defaut portait sur
-- toutes les colonnes, y compris points_balance et lifetime_points.
revoke insert on public.users from anon;
revoke insert on public.users from authenticated;

-- Seules les colonnes d'IDENTITE sont inserables. points_balance et
-- lifetime_points gardent leur valeur par defaut (0) et restent
-- reserves aux fonctions security definer (review_story, redeem_reward,
-- release_due_points).
--
-- `id` doit etre inserable : la policy "own profile - insert" verifie
-- justement `auth.uid() = id`. Elle reste le garde-fou qui empeche de
-- creer la ligne de quelqu'un d'autre.
grant insert (id, handle, email) on public.users to authenticated;

comment on table public.users is
  'Profil clubbeur. Ligne creee par l''inscription (colonnes id/handle/'
  'email uniquement). Le solde et le cumul ne sont ecrivables que par '
  'les fonctions security definer -- voir 0004 et 0018.';
