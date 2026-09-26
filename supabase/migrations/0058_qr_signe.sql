-- ============================================================
-- 0058 — Un QR qu'on ne peut pas tricher (26/09/2026)
-- ------------------------------------------------------------
-- Julien : « creer un systeme pour generer les QR codes, et qu'on ne puisse
-- pas tricher avec ces QR, donc un QR bien specifique a l'app ».
--
-- AVANT : le QR de l'affiche etait un simple lien ?club=<slug>. N'importe qui
-- pouvait le taper depuis chez lui (le slug est le nom du bar), ou le
-- recevoir en photo, et prendre ses +20 points chaque soir sans venir.
-- checkin_scan() ne verifiait rien d'autre que le nom.
--
-- MAINTENANT, trois verrous :
--   1. le QR porte un JETON SIGNE « slug.fenetre.signature ». La signature est
--      un HMAC-SHA256 calcule avec une cle secrete PROPRE A CHAQUE LIEU, que
--      personne ne peut lire (table sans aucun droit pour anon/authenticated).
--      On ne peut ni l'inventer ni la deviner a partir du nom du bar ;
--   2. l'AFFICHE (fenetre 0) exige que le telephone soit a moins de 300 m du
--      lieu (+ la precision annoncee, plafonnee a 200 m). Une photo de
--      l'affiche envoyee a un ami ne sert a rien chez lui ;
--   3. le QR EN DIRECT (fenetre = epoch/30) change toutes les 30 s sur un
--      ecran au bar : il n'est accepte que 90 s. Il ne demande pas la
--      position (pour qui la refuse) : une capture est perimee avant d'etre
--      partagee.
-- Le gerant peut changer la cle (qr_regenerer) : toutes les anciennes
-- affiches deviennent invalides d'un coup.
-- Toujours une fois par soiree et par lieu, 20 points (0057).
-- ============================================================

create table if not exists public.club_qr_secrets (
  club_id   uuid primary key references public.clubs(id) on delete cascade,
  secret    text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  version   integer not null default 1,
  change_le timestamptz not null default now()
);
alter table public.club_qr_secrets enable row level security;
revoke all on public.club_qr_secrets from public, anon, authenticated;

-- La cle d'un lieu, creee a la premiere demande.
create or replace function public.qr_secret_de(p_club uuid)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare v text;
begin
  select secret into v from public.club_qr_secrets where club_id = p_club;
  if v is null then
    insert into public.club_qr_secrets (club_id) values (p_club) on conflict (club_id) do nothing;
    select secret into v from public.club_qr_secrets where club_id = p_club;
  end if;
  return v;
end $$;
revoke all on function public.qr_secret_de(uuid) from public, anon, authenticated;

create or replace function public.qr_signer(p_club uuid, p_fenetre bigint)
returns text language sql security definer set search_path = public, extensions as $$
  select substr(encode(extensions.hmac(p_club::text || ':' || p_fenetre::text, public.qr_secret_de(p_club), 'sha256'), 'hex'), 1, 20);
$$;
revoke all on function public.qr_signer(uuid, bigint) from public, anon, authenticated;

-- Le jeton a mettre dans le QR. Appele par le serveur (api/credit-clubbeur,
-- action qr-club) avec la cle service, jamais par une appli.
create or replace function public.qr_jeton(p_club uuid, p_direct boolean default false)
returns table (jeton text, fenetre bigint, expire_le timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_f bigint; v_slug text;
begin
  select slug into v_slug from public.clubs where id = p_club;
  if v_slug is null then raise exception 'club_introuvable'; end if;
  v_f := case when p_direct then floor(extract(epoch from now()) / 30)::bigint else 0 end;
  return query select v_slug || '.' || v_f::text || '.' || public.qr_signer(p_club, v_f),
                      v_f,
                      case when p_direct then to_timestamp((v_f + 1) * 30) else null end;
end $$;
revoke all on function public.qr_jeton(uuid, boolean) from public, anon, authenticated;
grant execute on function public.qr_jeton(uuid, boolean) to service_role;

-- Nouvelle cle : les anciennes affiches ne rapportent plus rien.
create or replace function public.qr_regenerer(p_club uuid)
returns integer language plpgsql security definer set search_path = public, extensions as $$
declare v integer;
begin
  perform public.qr_secret_de(p_club);
  update public.club_qr_secrets
     set secret = encode(extensions.gen_random_bytes(32), 'hex'), version = version + 1, change_le = now()
   where club_id = p_club
  returning version into v;
  return v;
end $$;
revoke all on function public.qr_regenerer(uuid) from public, anon, authenticated;
grant execute on function public.qr_regenerer(uuid) to service_role;

-- Le scan. Remplace checkin_scan(slug).
create or replace function public.checkin_qr(
  p_jeton text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_precision double precision default null
) returns table (deja_recupere boolean, points integer, club_nom text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_parts text[];
  v_fenetre bigint;
  v_club record;
  v_deja boolean;
  v_distance double precision;
  v_montant integer := 20;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  v_parts := string_to_array(coalesce(trim(p_jeton), ''), '.');
  if array_length(v_parts, 1) is distinct from 3 then raise exception 'qr_invalide'; end if;
  begin
    v_fenetre := v_parts[2]::bigint;
  exception when others then
    raise exception 'qr_invalide';
  end;

  select id, name, lat, lng into v_club
    from public.clubs
   where lower(slug) = lower(v_parts[1]) and coalesce(visible, true)
   limit 1;
  if v_club.id is null then raise exception 'qr_invalide'; end if;

  -- Comparaison de la signature (le secret ne sort jamais de la base).
  if v_parts[3] is distinct from public.qr_signer(v_club.id, v_fenetre) then
    raise exception 'qr_invalide';
  end if;

  if v_fenetre <> 0 then
    -- QR en direct : 3 fenetres de 30 s (le temps de viser et d'ouvrir l'appli).
    if abs(floor(extract(epoch from now()) / 30)::bigint - v_fenetre) > 2 then
      raise exception 'qr_expire';
    end if;
  elsif v_club.lat is not null and v_club.lng is not null then
    -- Affiche : il faut etre sur place.
    if p_lat is null or p_lng is null then raise exception 'position_requise'; end if;
    v_distance := 6371000 * 2 * asin(sqrt(
      power(sin(radians(p_lat - v_club.lat) / 2), 2) +
      cos(radians(v_club.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - v_club.lng) / 2), 2)
    ));
    if v_distance > 300 + least(greatest(coalesce(p_precision, 0), 0), 200) then
      raise exception 'trop_loin';
    end if;
  end if;

  select exists (
    select 1 from public.point_grants
     where user_id = v_uid and club_id = v_club.id and source = 'scan'
       and public.soiree_de(created_at) = public.soiree_de(now())
  ) into v_deja;

  if v_deja then
    return query select true, 0, v_club.name;
    return;
  end if;

  insert into public.point_grants (user_id, club_id, story_id, amount, unlocks_at, released, source)
  values (v_uid, v_club.id, null, v_montant, now(), false, 'scan');
  perform public.release_due_points(v_uid);
  return query select false, v_montant, v_club.name;
end $$;
revoke all on function public.checkin_qr(text, double precision, double precision, double precision) from public, anon;
grant execute on function public.checkin_qr(text, double precision, double precision, double precision) to authenticated;

-- L'ancienne entree par le seul nom du lieu est fermee.
create or replace function public.checkin_scan(p_club_slug text)
returns table (deja_recupere boolean, points integer, club_nom text)
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'qr_ancien';
end $$;
