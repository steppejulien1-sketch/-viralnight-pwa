-- ============================================================
-- ViralNight PWA — 0002 · Gamification + Boutique de points
-- ------------------------------------------------------------
-- Une seule source de vérité, partagée par le dashboard owner
-- (écrit) et la PWA client (lit), synchronisée via Realtime.
--   - Niveaux (Bronze→Légende) sur lifetime_points + multiplicateur
--   - Streaks (soirées consécutives)
--   - Badges / achievements
--   - Challenges ponctuels par club
--   - Leaderboard hebdo par club
--   - Boutique enrichie (catégorie, stock, validité, niveau requis)
--   - redeem_reward() : rédemption ATOMIQUE (anti double-dépense stock)
-- ============================================================

-- ---------- Enums ----------
do $$ begin create type level_tier as enum
  ('bronze','argent','or','platine','legende'); exception when duplicate_object then null; end $$;

do $$ begin create type reward_category as enum
  ('boisson','entree','vip','exclusif'); exception when duplicate_object then null; end $$;

-- ============================================================
-- users : cumul à vie + niveau courant
-- ============================================================
alter table public.users add column if not exists lifetime_points int not null default 0;
alter table public.users add column if not exists current_level level_tier not null default 'bronze';

-- Seuils de niveau (points à vie) + multiplicateur de gain.
create table if not exists public.level_config (
  level        level_tier primary key,
  min_lifetime int not null,
  bonus_pct    int not null,      -- +10/20/30 % sur les points gagnés
  sort         int not null
);
insert into public.level_config (level, min_lifetime, bonus_pct, sort) values
  ('bronze',   0,     0,  1),
  ('argent',   1000,  10, 2),
  ('or',       3000,  20, 3),
  ('platine',  8000,  30, 4),
  ('legende',  20000, 30, 5)
on conflict (level) do nothing;

-- Recalcule le niveau d'un user d'après ses lifetime_points.
create or replace function public.level_for(lp int)
returns level_tier language sql immutable as $$
  select level from public.level_config where min_lifetime <= lp order by min_lifetime desc limit 1;
$$;

-- ============================================================
-- club_owners : lie un propriétaire à son club (pour la RLS d'écriture)
-- ============================================================
create table if not exists public.club_owners (
  user_id uuid not null references auth.users(id) on delete cascade,
  club_id uuid not null references public.clubs(id) on delete cascade,
  primary key (user_id, club_id)
);

create or replace function public.owns_club(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.club_owners where user_id = auth.uid() and club_id = cid);
$$;

-- ============================================================
-- rewards : enrichissement boutique
-- ============================================================
alter table public.rewards add column if not exists image_url      text;
alter table public.rewards add column if not exists category       reward_category not null default 'boisson';
alter table public.rewards add column if not exists stock_limit    int;             -- null = illimité
alter table public.rewards add column if not exists stock_remaining int;            -- null = illimité
alter table public.rewards add column if not exists valid_from     timestamptz;
alter table public.rewards add column if not exists valid_until    timestamptz;
alter table public.rewards add column if not exists required_level level_tier;      -- null = tous niveaux

-- ============================================================
-- streaks : soirées consécutives par (user, club)
-- ============================================================
create table if not exists public.streaks (
  user_id        uuid not null references public.users(id) on delete cascade,
  club_id        uuid not null references public.clubs(id) on delete cascade,
  current_streak int not null default 0,
  longest_streak int not null default 0,
  last_story_date date,
  primary key (user_id, club_id)
);

-- ============================================================
-- badges / achievements
-- ============================================================
create table if not exists public.badges (
  id               uuid primary key default gen_random_uuid(),
  code             text unique not null,
  name             text not null,
  description      text,
  icon             text,             -- nom d'icône (Lucide) ou url
  unlock_condition jsonb not null default '{}'::jsonb,
  sort             int not null default 0
);

create table if not exists public.user_badges (
  user_id     uuid not null references public.users(id) on delete cascade,
  badge_id    uuid not null references public.badges(id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, badge_id)
);

-- ============================================================
-- challenges : défis ponctuels créés par le club
-- ============================================================
create table if not exists public.challenges (
  id             uuid primary key default gen_random_uuid(),
  club_id        uuid not null references public.clubs(id) on delete cascade,
  title          text not null,
  description    text,
  bonus_points   int not null default 0,
  bonus_badge_id uuid references public.badges(id) on delete set null,
  starts_at      timestamptz not null default now(),
  ends_at        timestamptz not null,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index if not exists challenges_club_idx on public.challenges(club_id) where active;

-- ============================================================
-- leaderboard_entries : classement hebdo par club
-- ============================================================
create table if not exists public.leaderboard_entries (
  club_id         uuid not null references public.clubs(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  week_start_date date not null,
  week_points     int not null default 0,
  primary key (club_id, user_id, week_start_date)
);
create index if not exists lb_week_idx on public.leaderboard_entries(club_id, week_start_date, week_points desc);

-- Toggle du leaderboard par club.
alter table public.clubs add column if not exists leaderboard_enabled boolean not null default true;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.level_config        enable row level security;
alter table public.club_owners          enable row level security;
alter table public.streaks              enable row level security;
alter table public.badges               enable row level security;
alter table public.user_badges          enable row level security;
alter table public.challenges           enable row level security;
alter table public.leaderboard_entries  enable row level security;

-- Lecture publique : config niveaux, badges (catalogue), challenges actifs, leaderboard.
create policy "level_config read"  on public.level_config for select using (true);
create policy "badges read"        on public.badges for select using (true);
create policy "challenges read"    on public.challenges for select using (true);
create policy "leaderboard read"   on public.leaderboard_entries for select using (true);

-- club_owners : un user voit ses liens.
create policy "own club_owners" on public.club_owners for select using (auth.uid() = user_id);

-- streaks / user_badges : chacun ne voit que les siens.
create policy "own streaks"     on public.streaks for select using (auth.uid() = user_id);
create policy "own user_badges" on public.user_badges for select using (auth.uid() = user_id);

-- ---------- Écriture réservée aux propriétaires du club ----------
-- rewards : le client lit les rewards actifs dans leur fenêtre ; l'owner
-- gère ceux de son club. (La policy de lecture publique de 0001 est
-- remplacée par une lecture filtrée sur la validité.)
drop policy if exists "rewards readable by all" on public.rewards;
create policy "rewards read active" on public.rewards for select using (
  active
  and (valid_from is null or valid_from <= now())
  and (valid_until is null or valid_until >= now())
);
create policy "owner reads all his rewards" on public.rewards for select using (public.owns_club(club_id));
create policy "owner writes rewards" on public.rewards for all
  using (public.owns_club(club_id)) with check (public.owns_club(club_id));

-- challenges : écriture owner uniquement.
create policy "owner writes challenges" on public.challenges for all
  using (public.owns_club(club_id)) with check (public.owns_club(club_id));

-- clubs : l'owner peut modifier son club (couleur, leaderboard_enabled).
create policy "owner updates club" on public.clubs for update
  using (public.owns_club(id)) with check (public.owns_club(id));

-- ============================================================
-- redeem_reward() — rédemption ATOMIQUE
-- ------------------------------------------------------------
-- Vérifie solde, niveau requis, validité, stock ; décrémente le stock
-- et le solde ; crée la redemption + le QR ; le tout dans UNE
-- transaction avec verrou de ligne (row lock) sur le reward → deux
-- clients ne peuvent pas prendre le dernier stock en même temps.
-- SECURITY DEFINER : contourne la RLS mais vérifie tout manuellement.
-- Appel client : supabase.rpc('redeem_reward', { p_reward: '<uuid>' })
-- ============================================================
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

  -- Verrou de ligne sur le reward : sérialise les rédemptions concurrentes.
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

  -- Débit + stock.
  update public.users set points_balance = points_balance - v_reward.cost_points where id = v_uid;
  if v_reward.stock_remaining is not null then
    update public.rewards set stock_remaining = stock_remaining - 1 where id = p_reward;
  end if;

  v_qr := 'VN-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  insert into public.redemptions (user_id, reward_id, qr_code, used)
    values (v_uid, p_reward, v_qr, false) returning id into v_id;

  return query select v_id, v_qr, (v_user.points_balance - v_reward.cost_points);
end $$;

-- ============================================================
-- Realtime : publier les changements de rewards + challenges
-- ============================================================
do $$ begin
  alter publication supabase_realtime add table public.rewards;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.challenges;
exception when duplicate_object then null; end $$;
