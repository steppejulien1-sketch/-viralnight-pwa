-- ============================================================
-- 0037 — Trouver son club par geolocalisation
-- ------------------------------------------------------------
-- Jusqu'ici la SEULE facon de rattacher un compte a un club etait le
-- QR (?c=<slug>). Julien veut proposer la position GPS en premier :
-- si acceptee, on trouve le club le plus proche tout seul ; sinon, on
-- retombe sur "va scanner un QR" (deja en place, voir onboarding.js).
--
-- public.clubs n'avait AUCUNE coordonnee -- ajoutees ici, nullables
-- (un club sans coordonnees connues reste invisible a la recherche
-- par position, mais continue de fonctionner par QR comme avant).
-- Mirage est le seul club reel aujourd'hui : coordonnees reprises de
-- CLUBS.mirage.lngLat dans app-preview.html (Rue de l'Ecuyer,
-- Bruxelles) pour avoir au moins un point testable.
-- ============================================================

alter table public.clubs
  add column if not exists lat double precision,
  add column if not exists lng double precision;

update public.clubs
   set lat = 50.8479, lng = 4.3554
 where slug = 'mirage-brussels' and lat is null;

-- Distance a vol d'oiseau (Haversine, en metres) -- pas besoin de
-- PostGIS pour un simple "quel club est le plus proche".
create or replace function public.nearest_club_slug(p_lat double precision, p_lng double precision)
returns text
language sql stable as $$
  select slug
    from public.clubs
   where lat is not null and lng is not null
     and 6371000 * acos(
           least(1, greatest(-1,
             cos(radians(p_lat)) * cos(radians(lat)) *
             cos(radians(lng) - radians(p_lng)) +
             sin(radians(p_lat)) * sin(radians(lat))
           ))
         ) <= 300  -- 300 m : la taille d'un pate de maisons, pas toute une ville
   order by 6371000 * acos(
           least(1, greatest(-1,
             cos(radians(p_lat)) * cos(radians(lat)) *
             cos(radians(lng) - radians(p_lng)) +
             sin(radians(p_lat)) * sin(radians(lat))
           ))
         ) asc
   limit 1;
$$;

-- Lecture publique (clubs.slug/name/city le sont deja, "clubs readable
-- by all" -- 0001) : pas de session requise, la recherche par position
-- doit marcher AVANT meme d'avoir un compte, comme le scan d'un QR.
revoke all on function public.nearest_club_slug(double precision, double precision) from public;
grant execute on function public.nearest_club_slug(double precision, double precision) to anon, authenticated;
