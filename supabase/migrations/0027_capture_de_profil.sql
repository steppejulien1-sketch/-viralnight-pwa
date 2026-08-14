-- 0027 — Une capture de profil à l'inscription, vue par le club.
--
-- DEMANDE DE JULIEN (2026-08-14) : « quand on tape son nom d'utilisateur,
-- mets un truc pour mettre une capture d'écran en dessous ».
--
-- Elle arrive au bon moment : depuis la 0026, une story ne porte plus de
-- capture. Le gérant valide sur la mention reçue par le club — il lui
-- reste à savoir QUI est `@ce.pseudo`. Une capture du profil, prise une
-- fois à l'inscription, lui donne ce visage-là.
--
-- ⚠️ CE N'EST PAS LE RETOUR DE LA DÉCLARATION D'ABONNÉS (0024). On ne
-- demande AUCUN chiffre, et rien de ce qui est déposé ici n'entre dans un
-- calcul de points. C'est une pièce d'identité, pas une mesure.
--
-- ⚠️ POURQUOI LE BUCKET `story-proofs` ET PAS `follower-proofs`. La règle
-- de lecture de `follower-proofs` est « chacun son dossier » : le GÉRANT
-- n'y a pas accès, la capture y serait invisible pour lui — donc inutile.
-- `story-proofs` porte le club DANS LE CHEMIN (`{club}/{user}/…`,
-- migration 0015), et c'est exactement ce qui permet au gérant de lire.
-- 👉 Un chemin bien choisi remplace une policy fragile. Ne pas déplacer
-- ces captures sans refaire ce raisonnement.

begin;

alter table public.users
  add column if not exists profile_proof_path text,
  add column if not exists profile_proof_at   timestamptz;

comment on column public.users.profile_proof_path is
  'Capture du profil réseau, déposée à l''inscription. Chemin dans le '
  'bucket story-proofs : {club}/{user}/profil-*. Sert au gérant à '
  'reconnaître un pseudo. N''entre dans AUCUN calcul.';

-- ═══════════════════════════════════════════════════════════════════════
-- Écriture : une fonction, pas un grant de colonne
-- ═══════════════════════════════════════════════════════════════════════
-- ⚠️ La 0004 limite l'UPDATE client de `users` aux colonnes (handle,
-- email), et cette liste ne doit JAMAIS s'allonger — c'est elle qui
-- empêche un clubbeur de s'écrire des points. On passe donc par une
-- fonction qui n'écrit que les deux colonnes de cette migration.
create or replace function public.set_profile_proof(p_path text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_path text := nullif(btrim(coalesce(p_path, '')), '');
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- ⚠️ Le chemin doit être DANS le dossier de l'appelant. Sans ce
  -- contrôle, n'importe qui pourrait pointer sa fiche vers la capture
  -- d'un autre — le gérant verrait alors le mauvais visage en face d'un
  -- pseudo, ce qui est pire que pas de capture du tout.
  if v_path is not null and position('/' || v_uid::text || '/' in v_path) = 0 then
    raise exception 'chemin_invalide';
  end if;

  update public.users
     set profile_proof_path = v_path,
         profile_proof_at   = case when v_path is null then null else now() end
   where id = v_uid;
end;
$function$;

revoke execute on function public.set_profile_proof(text) from public, anon;
grant execute on function public.set_profile_proof(text) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════
-- Lecture : le gérant voit la capture de profil dans sa file
-- ═══════════════════════════════════════════════════════════════════════
drop function if exists public.get_pending_stories(uuid);

create or replace function public.get_pending_stories(p_club uuid)
returns table(
  story_id uuid, handle text, kind text, declared_views integer,
  ocr_views integer, ocr_error text, proof_path text, url text,
  submitted_at timestamptz,
  verified_views integer, views_source text, suggested_points integer,
  profile_proof_path text
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.owns_club(p_club) then raise exception 'not_owner'; end if;

  return query
  select s.id, u.handle, s.kind, c.extracted_views, c.ocr_views, c.ocr_error,
         c.screenshot_url, s.url, s.mentioned_at,
         s.verified_views, s.views_source,
         public.story_points(
           s.kind,
           case when s.views_source = 'tiktok_api' then s.verified_views end),
         u.profile_proof_path
    from public.story_events s
    join public.view_claims c on c.story_event_id = s.id
    join public.users u on u.id = s.user_id
   where s.club_id = p_club
     and s.verified = false
     and c.status = 'pending'
   order by s.mentioned_at;
end;
$function$;

-- L'ACL ne survit pas au drop : reposée à l'identique.
grant execute on function public.get_pending_stories(uuid)
  to anon, authenticated, service_role;

commit;

-- VÉRIFICATION
--   select proacl::text from pg_proc where proname = 'set_profile_proof';
--   -- ni public ni anon
--   select public.set_profile_proof('un/chemin/qui-n-est-pas-le-mien.png');
--   -- doit lever `chemin_invalide`
