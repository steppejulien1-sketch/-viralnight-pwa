-- ============================================================
-- 0047 — Validation automatique au bout de 24 h
-- ------------------------------------------------------------
-- Julien, 14/09/2026 : « j'aimerais que ca se valide automatiquement au
-- bout de vingt-quatre heures, ce qui est logique ». Une story Instagram
-- vit 24 h : passe ce delai, plus personne ne peut la verifier. Ce qui n'a
-- pas ete refuse d'ici la est donc valide, au meme forfait qu'a la main.
--
-- COMMENT CA TOURNE. Vercel Hobby ne lance ses crons qu'une fois par jour :
-- une story envoyee a 23 h aurait attendu jusqu'a 47 h. C'est donc pg_cron,
-- ici, qui appelle chaque heure /api/credit-clubbeur?action=auto-valider
-- (pg_net). La validation elle-meme se fait cote serveur Node, pour que le
-- clubbeur recoive sa notification et que le contenu cote gerants suive --
-- deux choses qu'une fonction SQL ne sait pas faire.
--
-- Le secret partage (en-tete x-noctify-auto) vit dans Vault sous le nom
-- 'auto_validation_secret' et dans la variable Vercel AUTO_VALIDATION_SECRET.
-- Il n'est PAS dans ce fichier : il se pose a part (voir le commit).
--
-- ⚠️ CE QUE CA IMPLIQUE. Sans refus dans les 24 h, un contenu invente est
-- credite. C'est le choix de Julien ; le garde-fou est la liste par
-- etablissement du pilotage, et la detection Instagram quand le club l'a reliee.
-- ============================================================

alter table public.story_events
  add column if not exists review_auto boolean not null default false;

drop function if exists public.pilotage_review_story(uuid, boolean, integer);

create or replace function public.pilotage_review_story(
  p_story uuid, p_approve boolean, p_points integer default null, p_auto boolean default false
) returns table(awarded integer, new_lifetime integer, unlocks_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_statut text;
begin
  select s.review_status into v_statut from public.story_events s where s.id = p_story for update;
  if not found then raise exception 'unknown_story'; end if;
  if v_statut is not null then raise exception 'already_reviewed'; end if;

  return query select * from public.review_story_core(p_story, p_approve, null, p_points);

  update public.story_events
     set review_status = case when p_approve then 'validee' else 'refusee' end,
         reviewed_at = now(),
         review_auto = coalesce(p_auto, false)
   where id = p_story;
end $$;

revoke all on function public.pilotage_review_story(uuid, boolean, integer, boolean) from public, anon, authenticated;
grant execute on function public.pilotage_review_story(uuid, boolean, integer, boolean) to service_role;

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- A la 17e minute de chaque heure. Relancer ce bloc remplace la tache du
-- meme nom au lieu d'en creer une seconde.
select cron.schedule(
  'noctify-auto-validation',
  '17 * * * *',
  $tache$
    select net.http_post(
      url := 'https://viralnight-koif.vercel.app/api/credit-clubbeur?action=auto-valider',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-noctify-auto', (select decrypted_secret from vault.decrypted_secrets where name = 'auto_validation_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $tache$
);
