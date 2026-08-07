-- 0016 — Corrige le nom de colonne du classement hebdomadaire.
--
-- `leaderboard_entries` a une colonne **week_start_date**. Les deux
-- fonctions qui creditent des points inseraient dans une colonne `week`
-- qui n'existe pas :
--     insert into leaderboard_entries (user_id, club_id, week, week_points)
--
-- Consequence : TOUT credit levait `42703: column "week" does not exist`
-- et la transaction entiere etait annulee. Le bug etait present dans
-- credit_story depuis l'origine ; il n'avait jamais explose parce que
-- l'ecran de publication etait un stub qui ne creditait rien en vrai.
-- Trouve en testant le nouveau circuit de bout en bout.
--
-- Aucune donnee a rattraper : rien n'a jamais ete credite par cette voie.

create or replace function public.review_story(
  p_story uuid,
  p_approve boolean,
  p_views integer default null
)
returns table(awarded integer, new_lifetime integer, unlocks_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_club uuid;
  v_user uuid;
  v_kind text;
  v_verified boolean;
  v_views int;
  v_total int;
  v_hours int;
  v_unlock timestamptz;
  v_life int;
begin
  select s.club_id, s.user_id, s.kind, s.verified
    into v_club, v_user, v_kind, v_verified
    from public.story_events s
   where s.id = p_story;

  if v_club is null then raise exception 'unknown_story'; end if;
  if not public.owns_club(v_club) then raise exception 'not_owner'; end if;
  -- Sans ce garde-fou, valider deux fois crediterait deux fois.
  if v_verified then raise exception 'already_reviewed'; end if;

  if not p_approve then
    update public.view_claims set status = 'rejected' where story_event_id = p_story;
    update public.story_events set awarded_points = 0, views = 0 where id = p_story;
    return query select 0, null::integer, null::timestamptz;
    return;
  end if;

  -- Le club peut corriger le chiffre declare : c'est lui qui a la capture
  -- sous les yeux.
  select coalesce(p_views, extracted_views) into v_views
    from public.view_claims where story_event_id = p_story;

  v_total := public.story_points(v_kind, v_views);
  if v_total is null then raise exception 'invalid_kind'; end if;

  update public.story_events
     set views = v_views,
         base_points = case when v_kind = 'story' then 100 else 60 end,
         awarded_points = v_total,
         verified = true
   where id = p_story;

  update public.view_claims
     set status = 'approved', extracted_views = v_views, bonus_points = v_total
   where story_event_id = p_story;

  -- Le gain reste bloque le temps prevu par le club (migration 0011).
  select coalesce(points_lock_hours, 12) into v_hours from public.clubs where id = v_club;
  v_unlock := now() + make_interval(hours => coalesce(v_hours, 12));

  insert into public.point_grants (user_id, club_id, story_id, amount, unlocks_at)
  values (v_user, v_club, p_story, v_total, v_unlock);

  update public.users
     set lifetime_points = lifetime_points + v_total
   where id = v_user
   returning lifetime_points into v_life;

  insert into public.leaderboard_entries (user_id, club_id, week_start_date, week_points)
  values (v_user, v_club, date_trunc('week', now())::date, v_total)
  on conflict (user_id, club_id, week_start_date)
  do update set week_points = public.leaderboard_entries.week_points + excluded.week_points;

  return query select v_total, v_life, v_unlock;
end;
$function$;

-- Meme correction dans credit_story. Elle n'est plus appelable depuis le
-- navigateur (0014) mais reste la voie des edge functions pour le jour ou
-- la verification viendra d'un webhook reseau : la laisser cassee
-- reporterait simplement le probleme.
create or replace function public.credit_story(
  p_club uuid,
  p_kind text default 'story',
  p_views integer default 0,
  p_url text default null
)
returns table(
  story_id uuid,
  awarded integer,
  new_balance integer,
  new_lifetime integer,
  unlocks_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid   uuid := auth.uid();
  v_kind  text;
  v_total int;
  v_id    uuid;
  v_bal   int;
  v_life  int;
  v_hours int;
  v_unlock timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  v_kind := lower(coalesce(p_kind, 'story'));
  if v_kind not in ('story', 'reel', 'tiktok') then
    raise exception 'invalid_kind: %', p_kind;
  end if;

  if p_views is null or p_views < 0 then p_views := 0; end if;
  if p_views > 1000000 then p_views := 1000000; end if;

  -- Bareme unique, partage avec review_story (migration 0014).
  v_total := public.story_points(v_kind, p_views);

  select coalesce(points_lock_hours, 12) into v_hours from public.clubs where id = p_club;
  v_unlock := now() + make_interval(hours => coalesce(v_hours, 12));

  insert into public.story_events (user_id, club_id, kind, url, base_points, awarded_points, views, verified)
  values (v_uid, p_club, v_kind, nullif(trim(coalesce(p_url, '')), ''),
          case when v_kind = 'story' then 100 else 60 end, v_total, p_views, true)
  returning id into v_id;

  insert into public.point_grants (user_id, club_id, story_id, amount, unlocks_at)
  values (v_uid, p_club, v_id, v_total, v_unlock);

  update public.users
     set lifetime_points = lifetime_points + v_total
   where id = v_uid
   returning points_balance, lifetime_points into v_bal, v_life;

  insert into public.leaderboard_entries (user_id, club_id, week_start_date, week_points)
  values (v_uid, p_club, date_trunc('week', now())::date, v_total)
  on conflict (user_id, club_id, week_start_date)
  do update set week_points = public.leaderboard_entries.week_points + excluded.week_points;

  return query select v_id, v_total, v_bal, v_life, v_unlock;
end;
$function$;

-- La revocation de la 0014 doit etre reposee : CREATE OR REPLACE reattribue
-- les droits par defaut, et sans ceci le verrou saute en silence.
revoke execute on function public.credit_story(uuid, text, integer, text) from anon, authenticated;
grant execute on function public.review_story(uuid, boolean, integer) to authenticated;
