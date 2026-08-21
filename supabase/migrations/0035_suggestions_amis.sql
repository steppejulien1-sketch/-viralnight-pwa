-- ============================================================
-- 0035 — Liste d'amis + suggestions ("amis d'amis")
-- ------------------------------------------------------------
-- La page Amis n'affichait jamais la liste des amis deja ajoutes, et
-- list_friends() (0031) ne renvoyait pas la photo de profil (elle
-- n'existait pas encore a l'epoque -- avatar_url arrive avec 0033).
--
-- Ajoute aussi suggest_friends() : "amis d'amis" (connaissances en
-- commun), le proxy le plus simple et le plus honnete pour "qui
-- pourrais-je connaitre" sans donnees de contact ni recommandation
-- comportementale -- ca n'existe nulle part dans le projet aujourd'hui.
-- ============================================================

-- list_friends() change de forme (avatar_url en plus) : CREATE OR
-- REPLACE refuse de changer les colonnes de retour d'une fonction
-- existante, il faut la supprimer d'abord.
drop function if exists public.list_friends();

create function public.list_friends()
returns table(friend_id uuid, friend_handle text, friend_avatar_url text, added_at timestamptz)
language sql security definer set search_path = public as $$
  select f.friend_id, u.handle, u.avatar_url, f.created_at
    from public.friendships f
    join public.users u on u.id = f.friend_id
   where f.user_id = auth.uid()
   order by f.created_at desc;
$$;

revoke all on function public.list_friends() from public;
grant execute on function public.list_friends() to authenticated;

-- Connaissances en commun : amis de mes amis, pas deja les miens, pas
-- moi-meme. Trie par nombre d'amis en commun (le plus probable qu'on
-- se connaisse reellement), 5 maximum pour rester une suggestion et
-- non une seconde liste complete.
create or replace function public.suggest_friends()
returns table(handle text, avatar_url text)
language sql security definer set search_path = public as $$
  select u.handle, u.avatar_url
    from public.friendships mes_amis
    join public.friendships amis_d_amis on amis_d_amis.user_id = mes_amis.friend_id
    join public.users u on u.id = amis_d_amis.friend_id
   where mes_amis.user_id = auth.uid()
     and amis_d_amis.friend_id <> auth.uid()
     and not exists (
       select 1 from public.friendships deja
        where deja.user_id = auth.uid() and deja.friend_id = amis_d_amis.friend_id
     )
   group by u.handle, u.avatar_url
   order by count(*) desc, u.handle
   limit 5;
$$;

revoke all on function public.suggest_friends() from public;
grant execute on function public.suggest_friends() to authenticated;
