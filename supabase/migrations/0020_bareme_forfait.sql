-- 0020 — Le barème passe au FORFAIT : les vues ne comptent plus.
--
-- ⚠️⚠️ NON APPLIQUÉE. Cette migration change l'économie du produit en
-- production. Elle ne doit partir qu'avec l'accord explicite de Julien,
-- et l'ordre compte (voir « DÉPLOIEMENT » en bas).
--
-- DÉCISION PRODUIT (2026-08-14) : « on ne se base plus sur les vues pour
-- le contenu ». Un contenu vaut désormais un montant fixe, quel que soit
-- le nombre de vues qu'il fait :
--
--       Story    100 pts        Reel  60 pts        TikTok  60 pts
--
-- Ce sont exactement les SOCLES actuels : personne ne perd son socle, on
-- retire seulement le bonus indexé sur les vues (20 pts / 100 vues en
-- story, 7 en reel et TikTok, plafonné à 2 000).
--
-- POURQUOI CE CHANGEMENT SIMPLIFIE AUSSI LA SÉCURITÉ. Le nombre de vues
-- était DÉCLARÉ par le clubbeur et vérifié à l'œil par le gérant sur une
-- capture. C'était le seul chiffre du produit qu'un utilisateur pouvait
-- gonfler, et toute la mécanique de validation existait d'abord pour ça.
-- Au forfait, il n'y a plus rien à gonfler : la capture ne prouve plus
-- qu'une chose, que la publication existe.
--
-- CE QUI NE CHANGE PAS, ET NE DOIT PAS CHANGER :
--   · la capture reste OBLIGATOIRE (`proof_required`) ;
--   · le club valide toujours avant que le moindre point tombe ;
--   · le blocage des points (migration 0011) reste en place ;
--   · `credit_story` reste RÉVOQUÉE pour anon et authenticated (0014) —
--     c'est le verrou qui empêche un clubbeur de se créditer lui-même.
--
-- ⚠️ SIGNATURES INCHANGÉES. `p_views` est conservé partout, et devient
-- simplement décoratif. C'est volontaire : changer une signature impose
-- un `drop function`, casse les clients déjà déployés le temps du
-- rechargement, et ferait perdre les droits. Les paramètres seront
-- retirés dans une migration ultérieure, quand plus aucun client ne les
-- enverra.

begin;

-- ═══════════════════════════════════════════════════════════════════════
-- 1) Le barème, toujours à UN SEUL endroit
-- ═══════════════════════════════════════════════════════════════════════
-- `p_views` est ignoré. Le paramètre reste pour ne pas casser
-- `review_story`, qui appelle cette fonction avec deux arguments.

create or replace function public.story_points(p_kind text, p_views integer)
returns integer
language sql
immutable
set search_path to 'public'
as $$
  select case lower(p_kind)
           when 'story'  then 100
           when 'reel'   then  60
           when 'tiktok' then  60
         end;
$$;

comment on function public.story_points(text, integer) is
  'Bareme FORFAITAIRE (0020) : un montant fixe par type de contenu. '
  'p_views est ignore, conserve uniquement pour ne pas changer la signature. '
  'Retourne NULL pour un type inconnu — les appelants DOIVENT lever.';


-- ═══════════════════════════════════════════════════════════════════════
-- 2) Dépôt : la capture reste obligatoire, les vues ne le sont plus
-- ═══════════════════════════════════════════════════════════════════════
-- Seul changement de fond : `views_required` ne peut plus être levée.
-- Un client à jour n'envoie plus de chiffre ; un client pas encore
-- rechargé continue d'en envoyer un, et il est simplement stocké.

create or replace function public.submit_story(
  p_club uuid,
  p_kind text,
  p_views integer,
  p_proof text,
  p_url text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_kind text;
  v_id uuid;
  v_views int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  v_kind := lower(coalesce(p_kind, ''));
  if v_kind not in ('story', 'reel', 'tiktok') then
    raise exception 'invalid_kind';
  end if;

  -- La capture est la piece justificative : sans elle, rien ne prouve que
  -- la publication existe. Elle ne porte plus le montant du gain, mais
  -- elle porte toujours la preuve.
  if p_proof is null or btrim(p_proof) = '' then
    raise exception 'proof_required';
  end if;

  -- ⚠️ LE CONTROLE `views_required` A DISPARU. C'etait la seule raison
  -- pour laquelle ce parametre etait obligatoire.
  -- ⚠️ story_events.views est NOT NULL DEFAULT 0 (migration 0012) : on ne
  -- peut PAS y ecrire NULL. Un depot sans chiffre stocke donc 0, qui se
  -- lit « non renseigne » maintenant que la colonne ne sert plus au
  -- calcul. Les bornes de la 0012 sont conservees.
  v_views := greatest(coalesce(p_views, 0), 0);
  if v_views > 1000000 then v_views := 1000000; end if;

  -- Un depot par contenu et par 12 h : evite qu'on renvoie dix fois la
  -- meme capture en esperant qu'une passe.
  if exists (
    select 1 from public.story_events s
     where s.user_id = v_uid
       and s.club_id = p_club
       and s.verified = false
       and s.mentioned_at > now() - interval '12 hours'
  ) then
    raise exception 'already_pending';
  end if;

  -- awarded_points = 0 et verified = false : la ligne existe pour etre
  -- verifiee, elle ne vaut rien tant que le club ne l'a pas regardee.
  insert into public.story_events
    (user_id, club_id, kind, url, base_points, awarded_points, views, verified)
  values
    (v_uid, p_club, v_kind, nullif(btrim(coalesce(p_url, '')), ''), 0, 0, v_views, false)
  returning id into v_id;

  insert into public.view_claims
    (story_event_id, user_id, screenshot_url, extracted_views, status)
  values
    (v_id, v_uid, p_proof, v_views, 'pending');

  return v_id;
end;
$function$;


-- ═══════════════════════════════════════════════════════════════════════
-- 3) Validation : approuver ou refuser, le montant ne se discute plus
-- ═══════════════════════════════════════════════════════════════════════
-- ⚠️ CHANGEMENT DE POUVOIR POUR LE GÉRANT. Avant, il pouvait corriger le
-- nombre de vues, donc fixer le montant versé. Au forfait, le montant est
-- determine par le seul type de contenu : `p_views` n'a plus d'effet sur
-- le gain. Le gerant garde la seule decision qui compte — valider, ou
-- refuser.
--
-- Le parametre est conserve (signature inchangee) et la valeur reste
-- ecrite dans l'historique si elle est fournie, mais elle n'entre plus
-- dans aucun calcul.

create or replace function public.review_story(
  p_story uuid,
  p_approve boolean,
  p_views integer default null
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
  v_total int;
  v_hours int;
  v_unlock timestamptz;
  v_life int;
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

  -- ⚠️ LE MONTANT NE DEPEND PLUS QUE DU TYPE.
  v_total := public.story_points(v_kind, null);
  if v_total is null then raise exception 'invalid_kind'; end if;

  -- base_points = awarded_points : il n'y a plus de bonus a distinguer du
  -- socle. Les garder differents laisserait croire a un supplement.
  update public.story_events
     set views = coalesce(v_views, 0),
         base_points = v_total,
         awarded_points = v_total,
         verified = true
   where id = p_story;

  update public.view_claims
     set status = 'approved',
         extracted_views = coalesce(v_views, 0),
         bonus_points = 0
   where story_event_id = p_story;

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


-- ═══════════════════════════════════════════════════════════════════════
-- 4) ⚠️ LE VERROU, REPOSÉ
-- ═══════════════════════════════════════════════════════════════════════
-- `CREATE OR REPLACE` conserve les droits d'une fonction de meme
-- signature, mais on les reecrit explicitement : c'est exactement sur ce
-- point que la 0016 avait fait sauter la revocation de la 0014 en
-- silence. Un verrou qu'on croit pose et qui ne l'est pas coute plus cher
-- que deux lignes redondantes.

revoke execute on function public.credit_story(uuid, text, integer, text) from anon, authenticated;

grant execute on function public.submit_story(uuid, text, integer, text, text) to authenticated;
grant execute on function public.review_story(uuid, boolean, integer) to authenticated;
grant execute on function public.get_pending_stories(uuid) to authenticated;
grant execute on function public.story_points(text, integer) to anon, authenticated;

commit;


-- ═══════════════════════════════════════════════════════════════════════
-- CE QUE CETTE MIGRATION NE FAIT PAS, VOLONTAIREMENT
-- ═══════════════════════════════════════════════════════════════════════
--
-- 1. LES BADGES `views_10k` ET `views_50k` NE SONT PAS SUPPRIMÉS.
--    Ils deviennent indebloquables : `get_my_badges` somme
--    `story_events.views`, qui ne grandira plus. Julien a demande de ne
--    pas les retirer sans son accord — des clubbeurs les poursuivaient.
--    L'app les affiche donc dans une section « En pause », attenues, sans
--    jauge, et hors du denominateur d'avancement (pages/collection.js).
--    👉 A trancher : les remplacer par des cibles sur le nombre de
--       contenus ou sur le streak, ou les archiver.
--
-- 2. `get_club_proof` N'EST PAS TOUCHÉE.
--    Elle alimente la preuve chiffree de l'accueil (« X vues generees ce
--    mois-ci »). Le total cesse simplement de grandir ; il reste vrai
--    pour le passe. L'ecran masque deja le bloc sous 3 contenus.
--    👉 A trancher : la passer sur un compte de contenus, ou la retirer.
--
-- 3. `credit_story` — RIEN A FAIRE, VERIFIE APRES COUP.
--    ⚠️ CORRECTION. Une premiere version de ce commentaire annoncait
--    qu'elle gardait un bareme aux vues ecrit en dur. C'EST FAUX.
--    Relecture de sa definition en base le 2026-08-14 : elle appelle
--    deja `public.story_points(v_kind, p_views)`, elle a donc bascule
--    au forfait en meme temps que tout le reste.
--    Elle reste REVOQUEE pour anon et authenticated depuis la 0014, et
--    aucun client ne l'appelle (`creditStory` dans src/lib/game.js n'est
--    importe nulle part).
--    Detail sans consequence : elle ecrit encore `base_points` avec un
--    `case ... then 100 else 60`, qui vaut exactement le forfait.
--
-- 4. AUCUNE DONNÉE HISTORIQUE N'EST RECALCULÉE.
--    Les gains deja verses restent tels quels. Recalculer retirerait des
--    points a des gens qui les ont gagnes sous l'ancienne regle.
--
--
-- ═══════════════════════════════════════════════════════════════════════
-- DÉPLOIEMENT — L'ORDRE COMPTE
-- ═══════════════════════════════════════════════════════════════════════
--
--   1. Appliquer CETTE migration.
--   2. Puis seulement, cote client, mettre `per100: 0` dans
--      src/lib/bareme.js :
--
--          story:  { base: 100, per100: 0 },
--          reel:   { base:  60, per100: 0 },
--          tiktok: { base:  60, per100: 0 },
--
--      `AU_FORFAIT`, `phraseBareme()` et `promesseCourte()` en decoulent :
--      toutes les phrases de l'app basculent seules.
--
-- ⚠️ DANS CET ORDRE. L'inverse annoncerait le forfait pendant que la base
-- paie encore aux vues — donc un montant different de celui promis. Entre
-- les deux etapes, l'app annonce l'ancien bareme et la base applique le
-- nouveau : le clubbeur touche moins que promis. C'est la seule fenetre
-- risquee, elle dure le temps d'un deploiement Vercel.
--
--
-- ═══════════════════════════════════════════════════════════════════════
-- VÉRIFICATION APRÈS APPLICATION
-- ═══════════════════════════════════════════════════════════════════════
--
-- -- a) Le bareme est bien forfaitaire, et insensible aux vues :
-- select public.story_points('story',  0)      as story_0,      -- 100
--        public.story_points('story',  999999) as story_999k,   -- 100
--        public.story_points('reel',   50000)  as reel,         --  60
--        public.story_points('tiktok', 0)      as tiktok,       --  60
--        public.story_points('bidon',  0)      as inconnu;      -- NULL
--
-- -- b) Le verrou tient toujours (doit renvoyer 0 ligne) :
-- select grantee, privilege_type
--   from information_schema.routine_privileges
--  where routine_name = 'credit_story'
--    and grantee in ('anon', 'authenticated');
--
-- -- c) Un depot SANS chiffre de vues passe (a lancer avec un jeton
-- --    clubbeur, puis supprimer la ligne creee) :
-- -- select public.submit_story('<club_uuid>', 'story', null, 'chemin/capture.jpg');
