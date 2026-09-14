-- ============================================================
-- 0046 — Valider les stories depuis le tableau de bord (pilotage.html)
-- ------------------------------------------------------------
-- Julien, 14/09/2026 : « que je puisse valider des stories ici, les posts
-- ici ». La file de validation de admin.html ne voyait que les contenus
-- REMONTES cote gerants par push-submission -- or une story Instagram n'a pas
-- de lien public, donc elle ne remontait jamais : elle etait invalidable.
-- Le pilotage lit directement story_events, ou TOUT arrive.
--
-- CE QUI MANQUAIT : un refus ne laissait aucune trace. review_story_core met
-- awarded_points = 0 mais laisse verified = false, exactement comme une story
-- en attente. Impossible de separer « a valider » de « refusee », et une story
-- refusee pouvait etre validee ensuite. D'ou review_status + reviewed_at.
--
-- Le calcul des points ne bouge pas : c'est review_story_core (forfait
-- story_points : story 100, reel 60, tiktok 60 + vues verifiees).
-- ============================================================

alter table public.story_events
  add column if not exists review_status text check (review_status in ('validee', 'refusee')),
  add column if not exists reviewed_at timestamptz;

-- Les stories deja validees avant cette migration.
update public.story_events
   set review_status = 'validee', reviewed_at = coalesce(reviewed_at, now())
 where verified and review_status is null;

create index if not exists story_events_a_valider_idx
  on public.story_events (mentioned_at)
  where verified = false and review_status is null;

-- Appelee par /api/update-client-status?action=pilotage-valider, avec la
-- cle service, apres verification du compte admin. Jamais par l'appli.
create or replace function public.pilotage_review_story(
  p_story uuid, p_approve boolean, p_points integer default null
) returns table(awarded integer, new_lifetime integer, unlocks_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_statut text;
begin
  -- Verrou de ligne : deux clics sur Valider ne creditent pas deux fois.
  select s.review_status into v_statut from public.story_events s where s.id = p_story for update;
  if not found then raise exception 'unknown_story'; end if;
  if v_statut is not null then raise exception 'already_reviewed'; end if;

  return query select * from public.review_story_core(p_story, p_approve, null, p_points);

  update public.story_events
     set review_status = case when p_approve then 'validee' else 'refusee' end,
         reviewed_at = now()
   where id = p_story;
end $$;

revoke all on function public.pilotage_review_story(uuid, boolean, integer) from public, anon, authenticated;
grant execute on function public.pilotage_review_story(uuid, boolean, integer) to service_role;

-- L'ancien chemin (admin.html -> credit-story) pose la meme trace, pour que
-- les deux ecrans disent la meme chose. Droits inchanges (create or replace).
create or replace function public.review_story_externe(
  p_story uuid, p_approve boolean, p_views integer default null, p_points integer default null
) returns table(awarded integer, new_lifetime integer, unlocks_at timestamptz)
language plpgsql security definer set search_path = public as $$
begin
  return query select * from public.review_story_core(p_story, p_approve, p_views, p_points);
  update public.story_events
     set review_status = case when p_approve then 'validee' else 'refusee' end,
         reviewed_at = now()
   where id = p_story and review_status is null;
end $$;
