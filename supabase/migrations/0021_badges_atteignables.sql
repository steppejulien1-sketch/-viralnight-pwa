-- 0021 — Les deux badges de vues sont REMPLACÉS par des cibles atteignables.
--
-- POURQUOI. Le passage au forfait (migration 0020) a supprimé le comptage
-- des vues. `get_my_badges` somme `story_events.views`, qui ne grandira
-- plus : `views_10k` et `views_50k` étaient devenus INDÉBLOQUABLES. L'app
-- les isolait dans une section « En pause », ce qui est honnête mais n'est
-- pas une fin — un objectif qu'on ne peut pas atteindre n'a rien à faire
-- dans une collection.
--
-- Julien a tranché : les remplacer, pas les retirer purement et simplement.
--
-- ⚠️ VÉRIFIÉ AVANT SUPPRESSION : les deux badges avaient **zéro détenteur**
-- (requête sur `user_badges` le 2026-08-14). Personne ne perd rien. C'est
-- la condition qui rend ce remplacement anodin — si un seul clubbeur les
-- avait eus, il aurait fallu les archiver au lieu de les supprimer.
--
-- CE QUI LES REMPLACE. Les deux nouvelles cibles prolongent des badges qui
-- existent déjà, plutôt que d'inventer une métrique de plus :
--   streak_3   (3 soirées d'affilée)  ->  streak_10  (10 d'affilée)
--   ten_stories (10 contenus)         ->  stories_50 (50 contenus)
-- Elles restent dans les métriques que `get_my_badges` sait calculer :
-- stories | views | redemptions | streak.

begin;

-- 1) On retire les deux badges devenus intenables ---------------------------
-- Le DELETE sur user_badges est le même garde-fou que la 0017 : sans lui,
-- la contrainte de clé étrangère bloquerait. Il ne touche rien ici (zéro
-- détenteur), mais il rend la migration rejouable sur une base où
-- quelqu'un aurait été crédité à la main entre-temps.
delete from public.user_badges
 where badge_id in (select id from public.badges where code in ('views_10k', 'views_50k'));

delete from public.badges where code in ('views_10k', 'views_50k');

-- 2) Deux objectifs qu'on peut réellement décrocher -------------------------
insert into public.badges (code, name, description, icon, sort, metric, target)
values
  ('streak_10',  'Dix d''affilée', 'Dix soirées de suite sans en louper une',        'flame',  5, 'streak',  10),
  ('stories_50', 'Pilier',         '50 contenus validés — tu fais partie des murs',  'trophy', 6, 'stories', 50)
on conflict (code) do update
  set name        = excluded.name,
      description = excluded.description,
      icon        = excluded.icon,
      sort        = excluded.sort,
      metric      = excluded.metric,
      target      = excluded.target;

commit;

-- ═══════════════════════════════════════════════════════════════════════
-- CE QUI N'EST PAS TOUCHÉ, VOLONTAIREMENT
-- ═══════════════════════════════════════════════════════════════════════
--
-- · `get_my_badges` garde son cas `when 'views' then v_views`. Il ne sert
--   plus, mais le laisser ne coûte rien et évite de toucher à une fonction
--   security definer pour un nettoyage cosmétique. Si un badge de vues
--   réapparaissait un jour, il fonctionnerait.
--
-- · `story_events.views` reste en base : les chiffres du passé sont vrais,
--   ils ne sont simplement plus alimentés.
--
-- · Côté client, `MESURES_EN_PAUSE` dans pages/collection.js reste en
--   place. Plus aucun badge ne le déclenche, mais c'est le filet qui
--   empêcherait d'afficher « 0 / 10 000 » si une métrique morte revenait.
--
-- ═══════════════════════════════════════════════════════════════════════
-- VÉRIFICATION APRÈS APPLICATION
-- ═══════════════════════════════════════════════════════════════════════
--
-- -- a) Le catalogue, et le nombre de detenteurs de chaque badge :
-- select b.code, b.name, b.metric, b.target,
--        (select count(*) from public.user_badges ub where ub.badge_id = b.id) as detenteurs
--   from public.badges b order by b.sort;
--
-- -- b) Plus aucun badge sur une metrique morte (doit renvoyer 0 ligne) :
-- select code from public.badges where metric = 'views';
