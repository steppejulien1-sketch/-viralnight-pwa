-- 0013 — Preuve chiffree PUBLIQUE de l'ecran d'accueil.
--
-- L'accueil affiche "8 400 vues sur la story de la derniere soiree — 280 pts".
-- Ce chiffre venait de mock.js : il etait le MEME pour tous les visiteurs et
-- pour tous les clubs. Montrer un chiffre invente comme preuve, c'est
-- exactement ce qu'on reproche a la page d'origine ("debloque des trucs
-- gratuits") : une promesse que rien n'appuie.
--
-- On expose donc un agregat reel, au niveau du CLUB (jamais d'un individu) :
-- la RLS de story_events limite chaque clubbeur a ses propres lignes, et
-- l'accueil est vu AVANT toute connexion — d'ou le security definer.
--
-- Aucune donnee personnelle ne sort : ni pseudo, ni identifiant, ni ligne
-- individuelle. Uniquement des totaux, et seulement s'ils sont assez etoffes
-- pour ne pas designer quelqu'un.

create or replace function public.get_club_proof(p_club uuid, p_days integer default 30)
returns table(
  contents bigint,
  views_total bigint,
  clubbeurs bigint,
  best_views integer,
  best_points integer
)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_since timestamptz;
begin
  if p_days is null or p_days < 1 then p_days := 30; end if;
  if p_days > 365 then p_days := 365; end if;
  v_since := now() - make_interval(days => p_days);

  return query
  with recent as (
    select s.user_id, s.views, s.awarded_points
      from public.story_events s
     where s.club_id = p_club
       and s.mentioned_at >= v_since
  ),
  agg as (
    select count(*)::bigint as n,
           coalesce(sum(views), 0)::bigint as v,
           count(distinct user_id)::bigint as u
      from recent
  ),
  meilleur as (
    -- La meilleure soiree sert d'exemple concret ("voila ce que ca donne").
    select views, awarded_points
      from recent
     order by views desc
     limit 1
  )
  select a.n, a.v, a.u,
         -- En dessous de 3 clubbeurs distincts, un "meilleur score" pointe
         -- quasiment quelqu'un : on ne le publie pas.
         case when a.u >= 3 then m.views else null end,
         case when a.u >= 3 then m.awarded_points else null end
    from agg a
    left join meilleur m on true;
end;
$function$;

comment on function public.get_club_proof(uuid, integer) is
  'Agregats publics d''un club pour l''ecran d''accueil. Aucune donnee nominative ; le meilleur score est masque en dessous de 3 participants.';

-- Lecture ouverte : l'accueil est vu avant toute connexion.
grant execute on function public.get_club_proof(uuid, integer) to anon, authenticated;
