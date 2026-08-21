-- ============================================================
-- 0034 — Suggestions au fil de la frappe (recherche d'amis)
-- ------------------------------------------------------------
-- add_friend (0031) fait une recherche EXACTE puis ajoute directement :
-- il faut deja connaitre le pseudo complet. Julien veut des suggestions
-- au fil de la frappe (comme n'importe quelle appli sociale) -- ca
-- suppose de pouvoir chercher par PREFIXE avant d'avoir choisi qui
-- ajouter, sans que ca ajoute quoi que ce soit tout seul.
--
-- Meme raison d'etre que add_friend : pas de lecture libre de
-- public.users (seule "own profile - select" existe, 0001), donc
-- security definer, cote serveur, avec une exposition minimale
-- (handle + avatar_url seulement -- jamais l'email).
-- ============================================================

create or replace function public.search_friends(p_query text)
returns table(handle text, avatar_url text)
language sql security definer set search_path = public as $$
  select u.handle, u.avatar_url
    from public.users u
   where u.id <> auth.uid()
     and length(trim(p_query)) >= 1
     and u.handle ilike trim(p_query) || '%'
   order by u.handle
   limit 8;
$$;

revoke all on function public.search_friends(text) from public;
grant execute on function public.search_friends(text) to authenticated;
