-- 0022 — Le gérant REFIXE le montant. Le forfait n'est plus qu'une proposition.
--
-- DÉCISION PRODUIT (2026-08-14, après la 0020) : Julien — « pourquoi le
-- gérant ne peut plus fixer le montant, ça j'apprécie pas, change ça ».
--
-- CE QUE LA 0020 AVAIT ENLEVÉ SANS QUE CE SOIT LE BUT. En supprimant le
-- calcul aux vues, elle a supprimé du même coup la seule prise que le
-- gérant avait sur le montant : il corrigeait le nombre de vues, et le
-- crédit suivait. Au forfait, `p_views` est devenu décoratif, donc
-- l'écran de validation ne laissait plus que « valider » ou « refuser ».
--
-- CE QUE FAIT CELLE-CI. Elle rend la main, mais SANS revenir aux vues :
--   · le forfait de `story_points()` reste le montant PROPOSÉ par défaut
--     (100 / 60 / 60) — un gérant qui ne touche à rien garde exactement
--     le comportement d'aujourd'hui ;
--   · `p_points` permet d'accorder un autre montant, décidé par le club.
--
-- ⚠️ POURQUOI UN MONTANT LIBRE ET PAS UN RETOUR AUX VUES. Le nombre de
-- vues était DÉCLARÉ par le clubbeur : le gérant ne fixait donc pas
-- vraiment le montant, il validait une déclaration. Ici il décide, et le
-- chiffre qui sort est le sien. C'est plus direct, et ça ne réintroduit
-- pas le seul chiffre du produit qu'un utilisateur pouvait gonfler.
--
-- ⚠️ SIGNATURE CHANGÉE — la 0020 disait de l'éviter, et elle avait
-- raison : un `drop function` fait PERDRE LES DROITS (l'ACL ne survit
-- pas), et casse les clients déjà chargés dans un navigateur le temps
-- qu'ils rechargent. Les deux points sont traités plus bas :
--   · les GRANT sont reposés à l'identique en fin de migration ;
--   · le nouveau paramètre a une valeur par défaut, donc un vieux front
--     qui appelle encore à 3 arguments continue de fonctionner (il
--     crédite le forfait, ce qu'il affiche).
-- Il FAUT dropper : ajouter un 4e paramètre à défaut sans supprimer
-- l'ancienne fonction créerait une SURCHARGE, et tout appel à 3
-- arguments deviendrait ambigu (`function is not unique`).
--
-- CE QUI NE CHANGE PAS, ET NE DOIT PAS CHANGER :
--   · `credit_story` reste RÉVOQUÉE pour anon et authenticated (0014) ;
--   · seul le propriétaire du club peut valider (`owns_club`) ;
--   · une story déjà validée ne peut pas l'être deux fois ;
--   · le blocage des points de la 0011 s'applique au montant accordé ;
--   · la capture reste obligatoire au dépôt (`submit_story`, inchangée).

begin;

-- ═══════════════════════════════════════════════════════════════════════
-- review_story — le forfait propose, le gérant dispose
-- ═══════════════════════════════════════════════════════════════════════

drop function if exists public.review_story(uuid, boolean, integer);

create or replace function public.review_story(
  p_story   uuid,
  p_approve boolean,
  p_views   integer default null,
  p_points  integer default null
)
returns table(awarded integer, new_lifetime integer, unlocks_at timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_club uuid;
  v_user uuid;
  v_kind text;
  v_verified boolean;
  v_views int;
  v_forfait int;
  v_total int;
  v_hours int;
  v_unlock timestamptz;
  v_life int;
  -- Garde-fou de saisie, pas une règle d'économie : il attrape le zéro de
  -- trop (10 000 au lieu de 1 000). Le club reste libre en dessous.
  c_max constant int := 2000;
begin
  select s.club_id, s.user_id, s.kind, s.verified
    into v_club, v_user, v_kind, v_verified
    from public.story_events s
   where s.id = p_story;

  if v_club is null then raise exception 'unknown_story'; end if;
  if not public.owns_club(v_club) then raise exception 'not_owner'; end if;
  -- Sans ce garde-fou, valider deux fois crediterait deux fois.
  if v_verified then raise exception 'already_reviewed'; end if;

  if not p_approve then
    update public.view_claims set status = 'rejected' where story_event_id = p_story;
    -- La ligne reste, marquee refusee : elle documente la decision plutot
    -- que de disparaitre sans trace.
    update public.story_events set awarded_points = 0, views = 0 where id = p_story;
    return query select 0, null::integer, null::timestamptz;
    return;
  end if;

  -- Conserve pour l'historique uniquement. N'entre plus dans le calcul.
  select coalesce(p_views, extracted_views, 0) into v_views
    from public.view_claims where story_event_id = p_story;

  -- Le forfait du type reste la REFERENCE : c'est ce qui est promis au
  -- clubbeur sur l'ecran de depot, et ce qui tombe si le gerant ne touche
  -- a rien.
  v_forfait := public.story_points(v_kind, null);
  if v_forfait is null then raise exception 'invalid_kind'; end if;

  -- ⚠️ LE MONTANT REDEVIENT UNE DECISION DU GERANT (0022).
  v_total := coalesce(p_points, v_forfait);
  if v_total < 0 or v_total > c_max then
    raise exception 'points_out_of_range';
  end if;

  -- base_points garde le FORFAIT, awarded_points ce qui a ete accorde :
  -- l'ecart entre les deux est la trace de la decision du gerant. La 0020
  -- les avait alignes parce qu'aucun ecart n'etait alors possible.
  update public.story_events
     set views = coalesce(v_views, 0),
         base_points = v_forfait,
         awarded_points = v_total,
         verified = true
   where id = p_story;

  -- `view_claims.bonus_points` reste a 0 (choix de la 0020) : l'ecart
  -- entre le forfait et le montant accorde se lit deja sur story_events
  -- (base_points vs awarded_points). Lui donner un second sens ici en
  -- ferait une source concurrente, sans lecteur pour l'exploiter.
  update public.view_claims
     set status = 'approved',
         extracted_views = coalesce(v_views, 0),
         bonus_points = 0
   where story_event_id = p_story;

  -- Un contenu valide a zero point : la publication est reconnue, mais
  -- rien n'est verse. On n'ecrit alors NI grant NI ligne de classement —
  -- une ligne a 0 polluerait l'historique et le classement hebdo sans
  -- rien dire de plus que l'absence de ligne.
  if v_total = 0 then
    select lifetime_points into v_life from public.users where id = v_user;
    return query select 0, v_life, null::timestamptz;
    return;
  end if;

  -- Le gain reste bloque le temps prevu par le club (migration 0011).
  select coalesce(points_lock_hours, 12) into v_hours from public.clubs where id = v_club;
  v_unlock := now() + make_interval(hours => coalesce(v_hours, 12));

  insert into public.point_grants (user_id, club_id, story_id, amount, unlocks_at)
  values (v_user, v_club, p_story, v_total, v_unlock);

  update public.users
     set lifetime_points = lifetime_points + v_total
   where id = v_user
   returning lifetime_points into v_life;

  -- ⚠️ LA COLONNE S'APPELLE week_start_date, PAS week. La 0016 a corrige
  -- ce bug qui annulait TOUTE la transaction (42703). Ne pas le reintroduire.
  insert into public.leaderboard_entries (user_id, club_id, week_start_date, week_points)
  values (v_user, v_club, date_trunc('week', now())::date, v_total)
  on conflict (user_id, club_id, week_start_date)
  do update set week_points = public.leaderboard_entries.week_points + excluded.week_points;

  return query select v_total, v_life, v_unlock;
end;
$function$;

comment on function public.review_story(uuid, boolean, integer, integer) is
  'Validation d''un contenu par le club. p_points : montant accorde ; '
  'null = forfait du type (story_points). Borne a 2000. p_views reste '
  'purement historique depuis la 0020.';

-- ═══════════════════════════════════════════════════════════════════════
-- DROITS — reposes a l'identique de l'ACL d'avant le drop
-- ═══════════════════════════════════════════════════════════════════════
-- Releve avant migration :
--   review_story  {=X/postgres, anon=X, authenticated=X, service_role=X}
-- La fonction se protege elle-meme par `owns_club()` : un clubbeur qui
-- l'appelle prend `not_owner`. C'est ce garde-fou qui autorise un GRANT
-- large, pas une tolerance.
grant execute on function public.review_story(uuid, boolean, integer, integer)
  to anon, authenticated, service_role;

-- ⚠️ FILET (voir 0016) : un `create or replace` peut rendre des droits par
-- defaut. On repose ici le verrou de la 0014 pour etre certain qu'aucun
-- clubbeur ne puisse se crediter directement.
revoke execute on function public.credit_story(uuid, text, integer, text)
  from anon, authenticated;

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFICATION APRES APPLICATION
-- ═══════════════════════════════════════════════════════════════════════
--   select proname, oid::regprocedure::text, proacl::text
--     from pg_proc where proname in ('review_story','credit_story');
-- Attendu : review_story(uuid,boolean,integer,integer) SEULE (l'ancienne
-- a 3 arguments ne doit plus exister), et credit_story sans anon ni
-- authenticated.
