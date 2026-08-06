-- ============================================================
-- 0009 — Nombre d'abonnes, affichage seul
-- ------------------------------------------------------------
-- Le chiffre est AFFICHE sur le profil et n'entre dans AUCUN calcul de
-- points. La v2 de la PWA a abandonne les paliers d'abonnes au profit des
-- vues reelles : un compte a 50 000 abonnes que personne ne regarde vaut
-- moins, pour le club, qu'un compte a 800 abonnes tres suivi. On ne
-- revient pas la-dessus, on donne juste un repere au clubbeur.
--
-- ⚠️ Ces colonnes ne sont ecrites QUE par les edge functions
-- (tiktok-auth / instagram-auth) en service_role, a partir de ce que le
-- reseau social repond. La migration 0004 a revoque l'UPDATE client sur
-- users hors (handle, email) : elles heritent donc de cette protection.
-- Ne JAMAIS ajouter ces colonnes au grant client, sinon n'importe qui
-- s'affiche 2 millions d'abonnes.
-- ============================================================

alter table public.users
  add column if not exists follower_count int check (follower_count >= 0);

alter table public.users
  add column if not exists follower_source text
  check (follower_source in ('tiktok', 'instagram'));

alter table public.users
  add column if not exists follower_updated_at timestamptz;

comment on column public.users.follower_count is
  'Abonnes rapportes par le reseau social a la connexion. AFFICHAGE SEUL : '
  'n''intervient dans aucun calcul de points. Ecrit uniquement par les '
  'edge functions en service_role.';

-- Verification : le grant client ne doit couvrir que handle et email.
-- (rappel de la migration 0004, laisse ici volontairement pour qu'une
-- relecture de ce fichier suffise a comprendre la protection)
revoke update on public.users from authenticated;
grant update (handle, email) on public.users to authenticated;
