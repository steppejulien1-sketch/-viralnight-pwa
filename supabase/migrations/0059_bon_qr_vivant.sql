-- ============================================================
-- 0059 — Le QR des bons, signe et vivant (26/09/2026)
-- ------------------------------------------------------------
-- Julien : « et les QR pour les recompenses, il faut generer des QR codes
-- aussi » -- dans la suite de 0058 (« qu'on ne puisse pas tricher »).
--
-- AVANT : le QR d'un bon etait fabrique DANS LE TELEPHONE a partir de son
-- code (« VN-REDEEM:VN-XXXX »), fixe pour toujours. N'importe qui pouvait
-- en dessiner un, et une capture d'ecran valait le bon.
--
-- MAINTENANT : le QR porte « code.fenetre.signature ». La signature est un
-- HMAC avec la cle secrete du LIEU du bon (club_qr_secrets, 0058) ; la
-- fenetre change toutes les 30 s. Seul le proprietaire du bon peut demander
-- son jeton (bon_jeton), seul le serveur peut le verifier (bon_verifier).
-- Le staff scanne l'ecran vivant : une capture est perimee en 90 s.
-- La validation reste unique (redemptions.used, api/credit-clubbeur
-- action valider-bon).
-- ============================================================

create or replace function public.bon_signature(p_club uuid, p_code text, p_fenetre bigint)
returns text language sql security definer set search_path = public, extensions as $$
  select substr(encode(extensions.hmac('bon:' || p_code || ':' || p_fenetre::text, public.qr_secret_de(p_club), 'sha256'), 'hex'), 1, 20);
$$;
revoke all on function public.bon_signature(uuid, text, bigint) from public, anon, authenticated;

-- Le jeton du QR, pour le proprietaire du bon uniquement.
create or replace function public.bon_jeton(p_code text)
returns table (jeton text, expire_le timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_bon record;
  v_f bigint := floor(extract(epoch from now()) / 30)::bigint;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select r.qr_code, r.used, w.club_id into v_bon
    from public.redemptions r join public.rewards w on w.id = r.reward_id
   where r.qr_code = p_code and r.user_id = auth.uid();
  if v_bon.qr_code is null then raise exception 'bon_introuvable'; end if;
  if v_bon.used then raise exception 'bon_utilise'; end if;
  return query select v_bon.qr_code || '.' || v_f::text || '.' || public.bon_signature(v_bon.club_id, v_bon.qr_code, v_f),
                      to_timestamp((v_f + 1) * 30);
end $$;
revoke all on function public.bon_jeton(text) from public, anon;
grant execute on function public.bon_jeton(text) to authenticated;

-- La verification, cote serveur seulement : renvoie le code du bon.
create or replace function public.bon_verifier(p_jeton text)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_parts text[] := string_to_array(coalesce(trim(p_jeton), ''), '.');
  v_f bigint;
  v_club uuid;
begin
  if array_length(v_parts, 1) is distinct from 3 then raise exception 'bon_qr_invalide'; end if;
  begin v_f := v_parts[2]::bigint; exception when others then raise exception 'bon_qr_invalide'; end;
  select w.club_id into v_club
    from public.redemptions r join public.rewards w on w.id = r.reward_id
   where r.qr_code = upper(v_parts[1]);
  if v_club is null then raise exception 'bon_qr_invalide'; end if;
  if lower(v_parts[3]) is distinct from public.bon_signature(v_club, upper(v_parts[1]), v_f) then
    raise exception 'bon_qr_invalide';
  end if;
  if abs(floor(extract(epoch from now()) / 30)::bigint - v_f) > 2 then raise exception 'bon_qr_perime'; end if;
  return upper(v_parts[1]);
end $$;
revoke all on function public.bon_verifier(text) from public, anon, authenticated;
grant execute on function public.bon_verifier(text) to service_role;
