-- 0023 — Audience cumulée : combien d'abonnés pèsent les gens qui postent.
--
-- DEMANDE DE JULIEN (2026-08-14) : « avoir le nombre d'abonnés cumulés de
-- tous les gens qui postent, pour mettre ça comme donnée ».
--
-- C'est la mesure qui remplace, en partie, ce que les vues donnaient avant
-- le forfait : un ordre de grandeur de l'audience que le club touche. Elle
-- ne s'y substitue PAS — voir les limites ci-dessous, qui doivent rester
-- visibles a l'ecran.
--
-- ⚠️ CE QUE CE CHIFFRE N'EST PAS, ET NE DOIT JAMAIS ETRE PRESENTE COMME :
--   · ce n'est PAS une portee. Deux clubbeurs partagent une partie de
--     leurs abonnes, et une story n'est vue que par une fraction d'entre
--     eux. Additionner des audiences surestime toujours.
--   · ce n'est PAS verifie. `declare_followers()` force
--     `follower_source = 'declared'` : le chiffre est saisi a la main, avec
--     une capture facultative. Un jour l'OAuth TikTok le remplira
--     ('tiktok'/'instagram') — d'ou la ventilation par source ci-dessous,
--     pour qu'on puisse dire ce qui est verifie et ce qui ne l'est pas.
--   · il est PARTIEL. La declaration est facultative a l'inscription. La
--     fonction renvoie donc la COUVERTURE (combien de contributeurs ont
--     renseigne quelque chose) : sans elle, un total de 3 400 pourrait
--     venir d'une personne sur trente et passer pour un total de club.
--
-- QUI COMPTE : ceux qui POSTENT, pas les inscrits. Un compte qui s'inscrit
-- et ne publie jamais n'apporte rien au club et ne doit pas gonfler le
-- chiffre. On retient donc les auteurs d'au moins un contenu VALIDE sur la
-- periode, et chaque personne compte UNE fois quel que soit son nombre de
-- publications.

begin;

create or replace function public.get_club_audience(p_club uuid, p_days integer default 30)
returns table(
  contributors        bigint,  -- personnes ayant publie (contenu valide)
  with_followers      bigint,  -- ... dont on connait l'audience
  followers_total     bigint,  -- somme des abonnes de ces personnes
  followers_declared  bigint,  -- part saisie a la main
  followers_verified  bigint,  -- part venue d'un reseau (OAuth)
  biggest             integer  -- plus grosse audience, si assez de monde
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_since timestamptz;
begin
  -- Les chiffres d'un club n'appartiennent qu'a lui.
  if not public.owns_club(p_club) then raise exception 'not_owner'; end if;

  if p_days is null or p_days < 1 then p_days := 30; end if;
  if p_days > 365 then p_days := 365; end if;
  v_since := now() - make_interval(days => p_days);

  return query
  with auteurs as (
    -- distinct : une personne compte une fois, pas une fois par story.
    select distinct s.user_id
      from public.story_events s
     where s.club_id = p_club
       and s.verified = true
       and s.mentioned_at >= v_since
  ),
  gens as (
    select u.follower_count as n, coalesce(u.follower_source, 'declared') as src
      from auteurs a
      join public.users u on u.id = a.user_id
  )
  select
    (select count(*) from gens),
    (select count(*) from gens where n is not null and n > 0),
    (select coalesce(sum(n), 0) from gens where n > 0),
    (select coalesce(sum(n), 0) from gens where n > 0 and src = 'declared'),
    (select coalesce(sum(n), 0) from gens where n > 0 and src <> 'declared'),
    -- Sous 3 personnes renseignees, la plus grosse audience DESIGNE
    -- quelqu'un : meme prudence que dans get_club_proof (0013).
    (select case when (select count(*) from gens where n > 0) >= 3
                 then (select max(n) from gens where n > 0) end);
end;
$function$;

comment on function public.get_club_audience(uuid, integer) is
  'Abonnes cumules des clubbeurs ayant publie un contenu valide sur la '
  'periode. Declaratif et partiel : toujours afficher la couverture '
  '(with_followers / contributors) a cote du total.';

-- ⚠️ `create or replace function` accorde EXECUTE a PUBLIC par defaut.
-- On le retire : anon n'en tirerait rien (owns_club echouerait), autant ne
-- pas exposer la fonction du tout.
revoke execute on function public.get_club_audience(uuid, integer) from public, anon;
grant execute on function public.get_club_audience(uuid, integer) to authenticated, service_role;

commit;

-- VERIFICATION
--   select * from public.get_club_audience('<club>', 30);
-- Attendu aujourd'hui sur le Mirage : contributors > 0, with_followers = 0
-- (personne n'a encore declare ses abonnes), donc followers_total = 0.
