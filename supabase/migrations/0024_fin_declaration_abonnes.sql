-- 0024 — Le clubbeur ne déclare plus ses abonnés lui-même.
--
-- DÉCISION DE JULIEN (2026-08-14, le jour même de la 0023) : « que le
-- client puisse lui-même mettre son nombre d'abos, c'est inutile ».
--
-- Il a raison, et c'est la limite que la 0023 affichait déjà à l'écran :
-- un chiffre qu'on se donne à soi-même ne prouve rien. Le garder revenait
-- à remplir une donnée de club avec des déclarations invérifiables.
--
-- CE QUI EST RETIRÉ : la saisie côté app (inscription ET profil), et le
-- DROIT d'appeler `declare_followers` depuis un navigateur. Le second
-- compte autant que le premier : sans lui, un front resté en cache
-- pourrait continuer d'écrire des chiffres déclarés pendant des jours.
--
-- CE QUI RESTE, ET POURQUOI :
--   · la fonction `declare_followers` n'est PAS supprimée. Elle reste
--     appelable par `service_role` (donc par les edge functions), et sa
--     suppression rendrait la 0010 non rejouable. C'est le DROIT qui
--     change, pas le code.
--   · `users.follower_count` / `follower_source` restent : les edge
--     functions `tiktok-auth` et `instagram-auth` les écrivent avec
--     `follower_source = 'tiktok'` / `'instagram'` — un chiffre VÉRIFIÉ
--     par le réseau, qui est justement ce qu'on veut.
--   · `get_club_audience` (0023) reste telle quelle. Elle affichera son
--     état vide tant que l'OAuth n'est pas configuré : c'est honnête, et
--     ça se remplira tout seul le jour où TikTok sera branché.
--
-- ⚠️ CONSÉQUENCE À ASSUMER : aujourd'hui l'audience cumulée du club vaut
-- ZÉRO, et le restera jusqu'à l'app TikTok Developer. Aucun contournement
-- ne doit être ajouté côté app pour « remplir » ce chiffre en attendant.

begin;

revoke execute on function public.declare_followers(text, integer, text)
  from public, anon, authenticated;

comment on function public.declare_followers(text, integer, text) is
  'RÉSERVÉE AU SERVEUR depuis la 0024. La saisie par le clubbeur a été '
  'retirée : un nombre d''abonnés ne peut plus venir que d''une connexion '
  'réseau (tiktok/instagram), qui écrit follower_source en conséquence.';

commit;

-- VERIFICATION
--   select proacl::text from pg_proc where proname = 'declare_followers';
-- Attendu : ni anon ni authenticated. Un appel depuis l'app doit prendre
-- un « permission denied for function declare_followers ».
