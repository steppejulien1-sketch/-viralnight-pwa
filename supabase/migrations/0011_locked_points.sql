-- ============================================================
-- 0011 — Points bloques pendant plusieurs heures
-- ------------------------------------------------------------
-- PROBLEME. credit_story creditait points_balance immediatement. Un
-- clubbeur pouvait donc poster une story et se payer une conso gratuite
-- dans la minute, avant que la story ait genere la moindre vue. Le club
-- payait la recompense sans avoir recu la visibilite.
--
-- PRINCIPE. Les points sont bien acquis tout de suite -- le clubbeur voit
-- son gain, c'est ce qui l'engage -- mais ils ne deviennent DEPENSABLES
-- qu'apres un delai, par defaut 12 heures. Poster a 1 h du matin donne des
-- points utilisables le lendemain a 13 h : plus la meme soiree.
--
-- MISE EN OEUVRE. points_balance ne contient QUE le depensable. Le reste
-- vit dans point_grants avec sa date de deblocage. Un grant mature est
-- verse au solde par release_due_points(), appelee avant toute lecture et
-- au debut de redeem_reward. Aucun cron necessaire : le deblocage se fait
-- au moment ou quelqu'un regarde ou depense.
--
-- lifetime_points, lui, est credite immediatement : il sert aux NIVEAUX,
-- qui ne sont pas depensables. Le clubbeur monte de niveau tout de suite.
-- ============================================================

-- Delai reglable par club : une soiree qui finit a 6 h n'a pas les memes
-- besoins qu'un bar qui ferme a minuit.
alter table public.clubs
  add column if not exists points_lock_hours int not null default 12
  check (points_lock_hours between 0 and 168);

comment on column public.clubs.points_lock_hours is
  'Heures avant qu''un point gagne devienne depensable. 0 = disponible '
  'immediatement. Defaut 12 h : les points d''une soiree sont utilisables '
  'le lendemain, pas le soir meme.';

create table if not exists public.point_grants (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  club_id    uuid not null references public.clubs(id) on delete cascade,
  story_id   uuid references public.story_events(id) on delete set null,
  amount     int  not null check (amount > 0),
  unlocks_at timestamptz not null,
  released   boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists point_grants_due_idx
  on public.point_grants(user_id, released, unlocks_at);

alter table public.point_grants enable row level security;

-- Lecture seule, et seulement les siens : le clubbeur doit pouvoir voir
-- "180 pts debloques dans 4 h". Aucune policy d'ecriture -- seules les
-- fonctions security definer y touchent.
drop policy if exists "own grants - select" on public.point_grants;
create policy "own grants - select"
  on public.point_grants for select using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Versement des grants arrives a echeance
-- ------------------------------------------------------------
create or replace function public.release_due_points(p_uid uuid default null)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := coalesce(p_uid, auth.uid());
  v_sum int;
begin
  if v_uid is null then return 0; end if;

  -- On marque et on somme dans le meme mouvement : deux appels
  -- simultanes ne peuvent pas verser deux fois le meme grant.
  with mures as (
    update public.point_grants
       set released = true
     where user_id = v_uid
       and released = false
       and unlocks_at <= now()
    returning amount
  )
  select coalesce(sum(amount), 0) into v_sum from mures;

  if v_sum > 0 then
    update public.users set points_balance = points_balance + v_sum where id = v_uid;
  end if;

  return v_sum;
end $$;

revoke all on function public.release_due_points(uuid) from public;
grant execute on function public.release_due_points(uuid) to authenticated;

-- ------------------------------------------------------------
-- Ce qui est encore bloque, et jusqu'a quand
-- ------------------------------------------------------------
create or replace function public.my_pending_points()
returns table(pending int, next_unlock timestamptz)
language sql security definer set search_path = public as $$
  select coalesce(sum(amount), 0)::int, min(unlocks_at)
    from public.point_grants
   where user_id = auth.uid() and released = false;
$$;

revoke all on function public.my_pending_points() from public;
grant execute on function public.my_pending_points() to authenticated;

-- ------------------------------------------------------------
-- credit_story : le gain part en grant, plus au solde
-- ------------------------------------------------------------
-- La signature de retour change (ajout de unlocks_at) : Postgres refuse
-- un CREATE OR REPLACE dans ce cas, il faut supprimer d'abord.
drop function if exists public.credit_story(uuid, text, int, text);

create or replace function public.credit_story(
  p_club uuid,
  p_kind text default 'story',
  p_views int default 0,
  p_url text default null
)
returns table(
  story_id uuid, awarded int, new_balance int, new_lifetime int, unlocks_at timestamptz
)
language plpgsql security definer set search_path = public as $$
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
  v_week  date := date_trunc('week', now())::date;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  v_kind := lower(coalesce(p_kind, 'story'));
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

  insert into public.story_events (user_id, club_id, kind, url, base_points, awarded_points)
  values (v_uid, p_club, v_kind, nullif(trim(coalesce(p_url, '')), ''), v_base, v_total)
  returning id into v_id;

  -- Le gain n'entre PAS dans points_balance : il attend son echeance.
  insert into public.point_grants (user_id, club_id, story_id, amount, unlocks_at)
  values (v_uid, p_club, v_id, v_total, v_unlock);

  -- lifetime_points suit les NIVEAUX, qui ne sont pas depensables : on le
  -- credite tout de suite pour que la progression reste immediate.
  update public.users
     set lifetime_points = lifetime_points + v_total
   where id = v_uid
   returning points_balance, lifetime_points into v_bal, v_life;

  insert into public.leaderboard_entries (user_id, club_id, week_start_date, week_points)
  values (v_uid, p_club, v_week, v_total)
  on conflict (club_id, user_id, week_start_date)
  do update set week_points = public.leaderboard_entries.week_points + excluded.week_points;

  return query select v_id, v_total, v_bal, v_life, v_unlock;
end $$;

revoke all on function public.credit_story(uuid, text, int, text) from public;
grant execute on function public.credit_story(uuid, text, int, text) to authenticated;

-- ------------------------------------------------------------
-- redeem_reward : verse d'abord ce qui est du, puis debite
-- ------------------------------------------------------------
create or replace function public.redeem_reward(p_reward uuid)
returns table(redemption_id uuid, qr_code text, new_balance int)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_reward public.rewards%rowtype;
  v_user public.users%rowtype;
  v_qr text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Sans cet appel, des points arrives a echeance resteraient invisibles
  -- jusqu'a la prochaine lecture et la redemption echouerait a tort.
  perform public.release_due_points(v_uid);

  select * into v_reward from public.rewards where id = p_reward for update;
  if not found then raise exception 'reward_not_found'; end if;
  if not v_reward.active then raise exception 'reward_inactive'; end if;
  if (v_reward.valid_from is not null and v_reward.valid_from > now())
     or (v_reward.valid_until is not null and v_reward.valid_until < now())
     then raise exception 'reward_out_of_window'; end if;
  if v_reward.stock_remaining is not null and v_reward.stock_remaining <= 0 then
    raise exception 'out_of_stock'; end if;

  select * into v_user from public.users where id = v_uid for update;
  if v_reward.required_level is not null then
    if (select sort from public.level_config where level = v_user.current_level)
       < (select sort from public.level_config where level = v_reward.required_level)
       then raise exception 'level_too_low'; end if;
  end if;
  if v_user.points_balance < v_reward.cost_points then raise exception 'insufficient_points'; end if;

  update public.users set points_balance = points_balance - v_reward.cost_points where id = v_uid;
  if v_reward.stock_remaining is not null then
    update public.rewards set stock_remaining = stock_remaining - 1 where id = p_reward;
  end if;

  v_qr := 'VN-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.redemptions (user_id, reward_id, qr_code, used)
    values (v_uid, p_reward, v_qr, false) returning id into v_id;

  return query select v_id, v_qr, (v_user.points_balance - v_reward.cost_points);
end $$;
