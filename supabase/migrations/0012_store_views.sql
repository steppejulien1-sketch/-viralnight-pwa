-- 0012 — Conserver le nombre de VUES de chaque contenu.
--
-- PROBLEME : credit_story() recevait p_views, s'en servait pour calculer le
-- bonus de points... puis le jetait. La donnee n'etait ecrite nulle part.
--
-- C'est pourtant la metrique centrale du produit : le clubbeur est paye a la
-- portee reelle, et le gerant achete precisement de la visibilite. Sans elle :
--   - l'historique du clubbeur ne peut afficher que "Story", pas "8 400 vues" ;
--   - le tableau de bord du gerant ne peut PAS repondre a sa seule vraie
--     question — "combien de vues mes clients m'ont rapporte ?" ;
--   - la preuve chiffree de l'ecran d'accueil ne peut pas etre reelle.
--
-- On ajoute la colonne, on la remplit desormais, et on la remonte dans les
-- deux fonctions d'agregat du dashboard proprietaire.

-- 1) La colonne ------------------------------------------------------------
alter table public.story_events
  add column if not exists views integer not null default 0;

comment on column public.story_events.views is
  'Vues declarees pour ce contenu au moment du credit. Sert a l''affichage et aux agregats ; le bareme reste calcule dans credit_story.';

-- Les agregats du gerant filtrent par club et par date : sans cet index,
-- get_club_stats fait un seek sequentiel des que le club prend du volume.
create index if not exists story_events_club_date_idx
  on public.story_events (club_id, mentioned_at desc);

-- 2) credit_story stocke desormais les vues --------------------------------
-- Meme corps qu'en 0011, seul l'INSERT change (ajout de la colonne views).
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
  v_base  int;
  v_per100 int;
  v_cap   int;
  v_bonus int;
  v_total int;
  v_id    uuid;
  v_bal   int;
  v_life  int;
  v_hours int;
  v_unlock timestamptz;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  v_kind := lower(coalesce(p_kind, 'story'));
  -- Un type inconnu leve une exception : pas de repli sur 'story', ce serait
  -- payer le tarif le plus genereux a qui envoie n'importe quoi.
  if v_kind not in ('story', 'reel', 'tiktok') then
    raise exception 'invalid_kind: %', p_kind;
  end if;

  case v_kind
    when 'story' then v_base := 100; v_per100 := 20; v_cap := 2000;
    when 'reel'  then v_base :=  60; v_per100 :=  7; v_cap := 2000;
    else              v_base :=  60; v_per100 :=  7; v_cap := 2000;
  end case;

  if p_views is null or p_views < 0 then p_views := 0; end if;
  if p_views > 1000000 then p_views := 1000000; end if;

  v_bonus := least((p_views / 100) * v_per100, v_cap);
  v_total := v_base + v_bonus;

  select coalesce(points_lock_hours, 12) into v_hours from public.clubs where id = p_club;
  v_unlock := now() + make_interval(hours => coalesce(v_hours, 12));

  insert into public.story_events (user_id, club_id, kind, url, base_points, awarded_points, views)
  values (v_uid, p_club, v_kind, nullif(trim(coalesce(p_url, '')), ''), v_base, v_total, p_views)
  returning id into v_id;

  -- Le gain n'entre PAS dans points_balance : il attend son echeance.
  insert into public.point_grants (user_id, club_id, story_id, amount, unlocks_at)
  values (v_uid, p_club, v_id, v_total, v_unlock);

  -- lifetime_points porte les NIVEAUX, qui ne sont pas depensables : on le
  -- credite tout de suite pour que la progression reste immediate.
  update public.users
     set lifetime_points = lifetime_points + v_total
   where id = v_uid
   returning points_balance, lifetime_points into v_bal, v_life;

  insert into public.leaderboard_entries (user_id, club_id, week, week_points)
  values (v_uid, p_club, date_trunc('week', now())::date, v_total)
  on conflict (user_id, club_id, week)
  do update set week_points = public.leaderboard_entries.week_points + excluded.week_points;

  return query select v_id, v_total, v_bal, v_life, v_unlock;
end;
$function$;

-- 3) Les vues remontent dans les agregats du gerant ------------------------
-- Changer le type de retour impose un drop prealable.
drop function if exists public.get_club_stats(uuid, integer);

create function public.get_club_stats(p_club uuid, p_days integer default 30)
returns table(
  contents_total bigint,
  contents_story bigint,
  contents_reel bigint,
  contents_tiktok bigint,
  views_total bigint,
  points_awarded bigint,
  rewards_redeemed bigint,
  active_clubbeurs bigint,
  points_outstanding bigint
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_since timestamptz;
begin
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
    (select coalesce(sum(s.views), 0) from public.story_events s
      where s.club_id = p_club and s.mentioned_at >= v_since),
    (select coalesce(sum(s.awarded_points), 0) from public.story_events s
      where s.club_id = p_club and s.mentioned_at >= v_since),
    (select count(*) from public.redemptions r
       join public.rewards w on w.id = r.reward_id
      where w.club_id = p_club and r.redeemed_at >= v_since),
    (select count(distinct s.user_id) from public.story_events s
      where s.club_id = p_club and s.mentioned_at >= v_since),
    -- Points distribues et pas encore depenses : l'engagement que le club
    -- doit encore honorer au bar.
    (select coalesce(sum(u.points_balance), 0)
       from public.users u
      where exists (select 1 from public.story_events s
                     where s.user_id = u.id and s.club_id = p_club));
end;
$function$;

drop function if exists public.get_club_activity(uuid, integer);

create function public.get_club_activity(p_club uuid, p_days integer default 14)
returns table(day date, contents bigint, views bigint, points bigint)
language plpgsql
security definer
set search_path to 'public'
as $function$
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
         coalesce(sum(s.views), 0)::bigint,
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
$function$;
