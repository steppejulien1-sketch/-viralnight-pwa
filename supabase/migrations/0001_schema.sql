-- ============================================================
-- ViralNight PWA — Schema initial
-- ------------------------------------------------------------
-- 6 tables : clubs, users, rewards, story_events, view_claims,
-- redemptions. Row Level Security activee partout : un clubbeur
-- ne voit QUE ses propres donnees ; les recompenses/clubs sont
-- en lecture publique (catalogue), l'ecriture est reservee au
-- service_role (Edge Functions) ou au club proprietaire.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- Paliers (enum) ----------
do $$ begin
  create type tier_level as enum ('x1', 'x2', 'x4', 'x8');
exception when duplicate_object then null; end $$;

do $$ begin
  create type claim_status as enum ('pending', 'approved', 'rejected');
exception when duplicate_object then null; end $$;

-- ============================================================
-- clubs
-- ============================================================
create table if not exists public.clubs (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  name          text not null,
  city          text not null,
  primary_color text not null default '#ff6363',
  logo_url      text,
  ig_handle     text not null,
  created_at    timestamptz not null default now()
);

-- ============================================================
-- users — profil clubbeur, lie a auth.users (magic link)
-- ============================================================
create table if not exists public.users (
  id               uuid primary key references auth.users(id) on delete cascade,
  handle           text not null,
  email            text,
  followers_count  int not null default 0,
  tier             tier_level not null default 'x1',
  tier_updated_at  timestamptz not null default now(),
  points_balance   int not null default 0 check (points_balance >= 0),
  created_at       timestamptz not null default now()
);

-- ============================================================
-- rewards — catalogue par club
-- ============================================================
create table if not exists public.rewards (
  id           uuid primary key default gen_random_uuid(),
  club_id      uuid not null references public.clubs(id) on delete cascade,
  title        text not null,
  description  text,
  cost_points  int not null check (cost_points > 0),
  active       boolean not null default true,
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists rewards_club_idx on public.rewards(club_id) where active;

-- ============================================================
-- story_events — une story taguee et creditee
-- ============================================================
create table if not exists public.story_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  club_id      uuid not null references public.clubs(id) on delete cascade,
  mentioned_at timestamptz not null default now(),
  base_points  int not null default 0,
  awarded_points int not null default 0,
  verified     boolean not null default false
);
create index if not exists story_events_user_idx on public.story_events(user_id);

-- ============================================================
-- view_claims — bonus base sur une capture de vues
-- ============================================================
create table if not exists public.view_claims (
  id              uuid primary key default gen_random_uuid(),
  story_event_id  uuid not null references public.story_events(id) on delete cascade,
  user_id         uuid not null references public.users(id) on delete cascade,
  screenshot_url  text,
  extracted_views int,
  status          claim_status not null default 'pending',
  bonus_points    int not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists view_claims_user_idx on public.view_claims(user_id);

-- ============================================================
-- redemptions — retrait d'une recompense (QR au bar)
-- ============================================================
create table if not exists public.redemptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  reward_id    uuid not null references public.rewards(id) on delete restrict,
  redeemed_at  timestamptz not null default now(),
  qr_code      text unique not null,
  used         boolean not null default false,
  used_at      timestamptz
);
create index if not exists redemptions_user_idx on public.redemptions(user_id);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.clubs        enable row level security;
alter table public.users        enable row level security;
alter table public.rewards      enable row level security;
alter table public.story_events enable row level security;
alter table public.view_claims  enable row level security;
alter table public.redemptions  enable row level security;

-- clubs : lecture publique (la landing /c/:slug affiche le club).
create policy "clubs readable by all"
  on public.clubs for select using (true);

-- rewards : catalogue lisible par tous (utilisateurs connectes).
create policy "rewards readable by all"
  on public.rewards for select using (true);

-- users : chacun ne lit/modifie que sa propre ligne.
create policy "own profile - select"
  on public.users for select using (auth.uid() = id);
create policy "own profile - insert"
  on public.users for insert with check (auth.uid() = id);
create policy "own profile - update"
  on public.users for update using (auth.uid() = id);

-- story_events : chacun ne voit que ses stories.
create policy "own stories - select"
  on public.story_events for select using (auth.uid() = user_id);

-- view_claims : chacun ne voit que ses claims, et ne peut inserer que
-- pour lui-meme (l'upload de capture vient du client).
create policy "own claims - select"
  on public.view_claims for select using (auth.uid() = user_id);
create policy "own claims - insert"
  on public.view_claims for insert with check (auth.uid() = user_id);

-- redemptions : chacun ne voit/cree que ses retraits.
create policy "own redemptions - select"
  on public.redemptions for select using (auth.uid() = user_id);
create policy "own redemptions - insert"
  on public.redemptions for insert with check (auth.uid() = user_id);

-- NB : l'attribution de points (story_events.awarded_points,
-- users.points_balance) et la validation des claims passent par des
-- Edge Functions en service_role, qui contournent RLS. Le client ne
-- credite jamais ses propres points directement.
