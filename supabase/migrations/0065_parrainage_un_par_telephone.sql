-- 0065 : un seul parrainage par telephone (05/10/2026).
--
-- Julien : « qu'on puisse scanner un QR code [d'invitation] par telephone,
-- pour eviter les fraudes ». Sans ca, on cree dix comptes sur le meme
-- telephone, on scanne dix fois son propre QR depuis un autre compte, et le
-- parrain empoche 10 x 100 points.
--
-- L'appli tire un identifiant aleatoire a la premiere ouverture et le garde
-- sur le telephone (localStorage). Il accompagne chaque reclamation. Ici, un
-- identifiant deja utilise par un parrainage est refuse : appareil_deja_utilise.
--
-- Limite connue : effacer les donnees de l'appli (ou la reinstaller) donne un
-- nouvel identifiant. Ni le web ni iOS ne donnent un identifiant materiel
-- stable a une appli (Apple l'interdit). C'est un frein, pas un mur.
--
-- Les anciennes signatures restent (appli en cache qui n'envoie pas encore
-- l'identifiant) : sans identifiant, pas de controle d'appareil.

alter table public.parrainages add column if not exists appareil text;
create unique index if not exists parrainages_appareil_unique
  on public.parrainages (appareil) where appareil is not null;

create or replace function public.claim_referral_pour(p_filleul uuid, p_code text, p_appareil text)
returns table(referrer_id uuid, referrer_handle text, awarded integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clean    text := trim(lower(coalesce(p_code, '')));
  v_app      text := nullif(left(trim(coalesce(p_appareil, '')), 80), '');
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

  -- Un telephone ne parraine qu'une fois, quel que soit le compte.
  if v_app is not null and exists (select 1 from public.parrainages where appareil = v_app) then
    raise exception 'appareil_deja_utilise';
  end if;

  select created_at into v_cree from auth.users where id = p_filleul;
  if v_cree is null or v_cree < now() - interval '3 days' then
    raise exception 'compte_ancien';
  end if;

  select id, handle into v_referrer from public.users where referral_code = v_clean limit 1;
  if v_referrer.id is null then
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
  insert into public.parrainages (parrain_id, filleul_id, points, appareil) values (v_referrer.id, p_filleul, v_points, v_app);
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

revoke all on function public.claim_referral_pour(uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_referral_pour(uuid, text, text) to service_role;

-- L'ancienne signature passe par la nouvelle, sans identifiant.
create or replace function public.claim_referral_pour(p_filleul uuid, p_code text)
returns table(referrer_id uuid, referrer_handle text, awarded integer)
language sql
security definer
set search_path = public
as $$
  select * from public.claim_referral_pour(p_filleul, p_code, null);
$$;
revoke all on function public.claim_referral_pour(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_referral_pour(uuid, text) to service_role;

-- Le repli de l'appli (serveur injoignable), avec l'identifiant.
create or replace function public.claim_referral(p_code text, p_appareil text)
returns table(referrer_id uuid, referrer_handle text, awarded integer)
language sql
security definer
set search_path = public
as $$
  select * from public.claim_referral_pour(auth.uid(), p_code, p_appareil);
$$;
grant execute on function public.claim_referral(text, text) to authenticated;
