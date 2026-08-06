-- ============================================================
-- 0006 — Statistiques du club pour le proprietaire
-- ------------------------------------------------------------
-- Le dashboard proprietaire n'avait aucune vue sur ce que generent les
-- clubbeurs : la section Statistiques etait un placeholder. Et pour
-- cause, les policies ne laissent chacun lire QUE ses propres lignes :
--     "own stories - select"     using (auth.uid() = user_id)
--     "own redemptions - select" using (auth.uid() = user_id)
--
-- Deux facons d'ouvrir ca. On a choisi la seconde :
--   a) ajouter des policies "owner reads" sur story_events et
--      redemptions -> le proprio verrait chaque ligne, donc l'activite
--      individuelle et nominative de chaque clubbeur ;
--   b) des fonctions qui ne renvoient QUE des agregats.
-- (b) donne au club ce dont il a besoin sans exposer le detail de
-- chaque personne. Le classement nominatif existe deja a part
-- (get_leaderboard, migration 0003) et reste le seul endroit nominatif.
-- ============================================================

-- ------------------------------------------------------------
-- Totaux sur une fenetre glissante
-- ------------------------------------------------------------
create or replace function public.get_club_stats(
  p_club uuid,
  p_days int default 30
)
returns table(
  contents_total   bigint,
  contents_story   bigint,
  contents_reel    bigint,
  contents_tiktok  bigint,
  points_awarded   bigint,
  rewards_redeemed bigint,
  active_clubbeurs bigint,
  points_outstanding bigint
)
language plpgsql security definer set search_path = public as $$
declare
  v_since timestamptz;
begin
  -- Seul un proprietaire du club voit ses chiffres.
  if not public.owns_club(p_club) then
    raise exception 'not_owner';
  end if;

  if p_days is null or p_days < 1 then p_days := 30; end if;
  if p_days > 365 then p_days := 365; end if;
  v_since := now() - make_interval(days => p_days);

  return query
  select
    (select count(*) from public.story_events s
      where s.club_id = p_club and s.mentioned_at >= v_since),
    (select count(*) from public.story_events s
      where s.club_id = p_club and s.mentioned_at >= v_since and s.kind = 'story'),
    (select count(*) from public.story_events s
      where s.club_id = p_club and s.mentioned_at >= v_since and s.kind = 'reel'),
    (select count(*) from public.story_events s
      where s.club_id = p_club and s.mentioned_at >= v_since and s.kind = 'tiktok'),
    (select coalesce(sum(s.awarded_points), 0) from public.story_events s
      where s.club_id = p_club and s.mentioned_at >= v_since),
    (select count(*) from public.redemptions r
       join public.rewards w on w.id = r.reward_id
      where w.club_id = p_club and r.redeemed_at >= v_since),
    (select count(distinct s.user_id) from public.story_events s
      where s.club_id = p_club and s.mentioned_at >= v_since),
    -- Points distribues et pas encore depenses : c'est l'engagement que
    -- le club doit encore honorer au bar.
    (select coalesce(sum(u.points_balance), 0)
       from public.users u
      where exists (select 1 from public.story_events s
                     where s.user_id = u.id and s.club_id = p_club));
end;
$$;

revoke all on function public.get_club_stats(uuid, int) from public;
grant execute on function public.get_club_stats(uuid, int) to authenticated;

-- ------------------------------------------------------------
-- Serie journaliere, pour tracer une courbe
-- ------------------------------------------------------------
create or replace function public.get_club_activity(
  p_club uuid,
  p_days int default 14
)
returns table(day date, contents bigint, points bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not public.owns_club(p_club) then
    raise exception 'not_owner';
  end if;

  if p_days is null or p_days < 1 then p_days := 14; end if;
  if p_days > 90 then p_days := 90; end if;

  -- generate_series pour que les jours SANS activite apparaissent quand
  -- meme : sinon la courbe saute les creux et ment sur la regularite.
  return query
  select d::date,
         coalesce(count(s.id), 0)::bigint,
         coalesce(sum(s.awarded_points), 0)::bigint
    from generate_series(
           (current_date - (p_days - 1)),
           current_date,
           interval '1 day'
         ) as d
    left join public.story_events s
      on s.club_id = p_club
     and s.mentioned_at >= d
     and s.mentioned_at <  d + interval '1 day'
   group by d
   order by d;
end;
$$;

revoke all on function public.get_club_activity(uuid, int) from public;
grant execute on function public.get_club_activity(uuid, int) to authenticated;
