-- 0051 -- Un parrainage qui marche, et qui se voit.
--
-- Julien, 15/09/2026 : « le systeme de parrainage a l'air douteux et
-- complique, j'ai essaye et je n'ai pas recu de points ». Ce qu'on a trouve
-- en base :
--
-- 1. Le lien portait le PSEUDO (?parrain=julien.stpt) et claim_referral
--    cherchait « where lower(handle) = code limit 1 ». Or le pseudo n'est pas
--    unique : trois comptes de Julien portent julien.stpt (le pseudo vient de
--    la capture Instagram). Les points tombaient sur un des trois, au hasard.
-- 2. Sans club frequente, les points etaient ajoutes au solde sans aucune
--    ligne d'historique, sans notification : invisibles.
-- 3. Un compte deja ancien (cree en aout) pouvait se faire « parrainer » en
--    ouvrant un lien.
--
-- Ce qui change :
-- - chaque compte a un CODE de parrainage unique (users.referral_code), et
--   c'est lui qui va dans le lien. Les anciens liens au pseudo marchent
--   encore, mais seulement si ce pseudo est porte par UN seul compte ;
-- - seul un compte cree depuis moins de 3 jours peut etre parraine ;
-- - les points vont directement au solde (comme le cadeau de bienvenue,
--   0049) et chaque parrainage a sa ligne dans public.parrainages : historique
--   du parrain, et page « ton ami s'est inscrit » a l'ouverture de l'appli ;
-- - claim_referral_pour(filleul, code) : la meme chose appelee par le
--   serveur (service_role), qui envoie ensuite la notification au parrain.

-- ---------- Le code ----------
create or replace function public.nouveau_code_parrainage()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  -- Sans 0/o, 1/l/i : un code qui se lit a voix haute sans se tromper.
  v_alpha constant text := 'abcdefghjkmnpqrstuvwxyz23456789';
  v_code text;
begin
  loop
    v_code := '';
    for i in 1..7 loop
      v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1);
    end loop;
    exit when not exists (select 1 from public.users where referral_code = v_code);
  end loop;
  return v_code;
end;
$$;

alter table public.users add column if not exists referral_code text;
update public.users set referral_code = public.nouveau_code_parrainage() where referral_code is null;
alter table public.users alter column referral_code set default public.nouveau_code_parrainage();
alter table public.users alter column referral_code set not null;
create unique index if not exists users_referral_code_uniq on public.users (referral_code);

-- ---------- La trace ----------
create table if not exists public.parrainages (
  id          uuid primary key default gen_random_uuid(),
  parrain_id  uuid not null references public.users(id) on delete cascade,
  filleul_id  uuid not null unique references public.users(id) on delete cascade,
  points      int  not null,
  created_at  timestamptz not null default now()
);
create index if not exists parrainages_parrain_idx on public.parrainages (parrain_id, created_at desc);

alter table public.parrainages enable row level security;
drop policy if exists "parrainages - le parrain et le filleul lisent" on public.parrainages;
create policy "parrainages - le parrain et le filleul lisent" on public.parrainages
  for select using (auth.uid() = parrain_id or auth.uid() = filleul_id);

-- Les parrainages deja faits reprennent leur ligne. Depuis la remise a zero
-- du 13/09 (point_grants vide), ils ont tous ete credites par le chemin direct,
-- au montant actuel ; la date est celle de l'amitie creee au meme instant.
insert into public.parrainages (parrain_id, filleul_id, points, created_at)
select u.referred_by, u.id, public.montant_parrainage(),
       coalesce((select min(f.created_at) from public.friendships f where f.user_id = u.id and f.friend_id = u.referred_by), u.created_at, now())
  from public.users u
 where u.referred_by is not null
on conflict (filleul_id) do nothing;

-- ---------- La reclamation ----------
create or replace function public.claim_referral_pour(p_filleul uuid, p_code text)
returns table(referrer_id uuid, referrer_handle text, awarded integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean    text := trim(lower(coalesce(p_code, '')));
  v_referrer record;
  v_deja     uuid;
  v_cree     timestamptz;
  v_points   int := public.montant_parrainage();
  v_nb       int;
begin
  if p_filleul is null then
    raise exception 'not_authenticated';
  end if;
  if v_clean = '' then
    raise exception 'code_manquant';
  end if;

  select referred_by into v_deja from public.users where id = p_filleul;
  if v_deja is not null or exists (select 1 from public.parrainages where filleul_id = p_filleul) then
    raise exception 'deja_parraine';
  end if;

  -- Seulement les nouveaux inscrits : un compte existant qui ouvre un lien
  -- ne rapporte rien.
  select created_at into v_cree from auth.users where id = p_filleul;
  if v_cree is null or v_cree < now() - interval '3 days' then
    raise exception 'compte_ancien';
  end if;

  select id, handle into v_referrer from public.users where referral_code = v_clean limit 1;
  if v_referrer.id is null then
    -- Ancien lien au pseudo : accepte seulement si le pseudo est sans ambiguite.
    select count(*) into v_nb from public.users where lower(handle) = v_clean;
    if v_nb = 1 then
      select id, handle into v_referrer from public.users where lower(handle) = v_clean;
    end if;
  end if;
  if v_referrer.id is null then
    raise exception 'introuvable';
  end if;
  if v_referrer.id = p_filleul then
    raise exception 'soi_meme';
  end if;

  update public.users set referred_by = v_referrer.id where id = p_filleul;
  insert into public.parrainages (parrain_id, filleul_id, points) values (v_referrer.id, p_filleul, v_points);
  update public.users
     set points_balance  = points_balance + v_points,
         lifetime_points = lifetime_points + v_points
   where id = v_referrer.id;

  insert into public.friendships (user_id, friend_id) values (p_filleul, v_referrer.id)
    on conflict (user_id, friend_id) do nothing;
  insert into public.friendships (user_id, friend_id) values (v_referrer.id, p_filleul)
    on conflict (user_id, friend_id) do nothing;

  return query select v_referrer.id, v_referrer.handle, v_points;
end;
$$;

revoke all on function public.claim_referral_pour(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_referral_pour(uuid, text) to service_role;

-- L'appel depuis l'appli (repli quand le serveur ne repond pas) : meme regles.
create or replace function public.claim_referral(p_code text)
returns table(referrer_id uuid, referrer_handle text, awarded integer)
language sql
security definer
set search_path = public
as $$
  select * from public.claim_referral_pour(auth.uid(), p_code);
$$;
grant execute on function public.claim_referral(text) to authenticated;

-- ---------- Ce que le parrain voit ----------
-- Ses parrainages recents, avec le pseudo ACTUEL du filleul (la table users
-- n'est pas lisible par les autres comptes, d'ou la fonction).
create or replace function public.mes_parrainages_recents(p_jours int default 7)
returns table(id uuid, points int, pseudo text, created_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.points, u.handle, p.created_at
    from public.parrainages p
    join public.users u on u.id = p.filleul_id
   where p.parrain_id = auth.uid()
     and p.points > 0
     and p.created_at > now() - make_interval(days => greatest(1, least(coalesce(p_jours, 7), 400)))
   order by p.created_at asc;
$$;
grant execute on function public.mes_parrainages_recents(int) to authenticated;
