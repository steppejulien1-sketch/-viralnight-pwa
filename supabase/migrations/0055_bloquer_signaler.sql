-- 0055 · Bloquer et signaler un autre utilisateur (25/09/2026).
--
-- Exige par Apple (regle 1.2) des qu'une appli montre le contenu d'autres
-- utilisateurs (pseudos, photos de profil, amis). add_friend cree en plus une
-- amitie MUTUELLE sans accord de l'autre : sans blocage, n'importe qui pouvait
-- s'inviter dans la liste d'amis de n'importe qui.
--
-- Bloquer : retire l'amitie dans les deux sens et empeche de se retrouver
-- (recherche, suggestions, ajout), dans les deux sens.
-- Signaler : ecrit un message dans support_messages, que Julien lit et traite
-- depuis pilotage.html comme le reste du support.

create table if not exists public.blocages (
  user_id    uuid not null references public.users(id) on delete cascade,
  bloque_id  uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, bloque_id)
);
-- Aucune policy : la table ne se lit et ne s'ecrit que par les fonctions.
alter table public.blocages enable row level security;

create or replace function public.est_bloque(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.blocages
                  where (user_id = a and bloque_id = b) or (user_id = b and bloque_id = a));
$$;

create or replace function public.bloquer_utilisateur(p_handle text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_cible uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select id into v_cible from public.users where lower(handle) = trim(lower(p_handle)) limit 1;
  if v_cible is null then raise exception 'introuvable'; end if;
  if v_cible = v_uid then raise exception 'soi_meme'; end if;
  insert into public.blocages (user_id, bloque_id) values (v_uid, v_cible) on conflict do nothing;
  delete from public.friendships
   where (user_id = v_uid and friend_id = v_cible) or (user_id = v_cible and friend_id = v_uid);
end;
$$;

create or replace function public.signaler_utilisateur(p_handle text, p_motif text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  insert into public.support_messages (user_id, message, auteur)
  values (v_uid,
          '[Signalement] @' || trim(p_handle) || ' : ' ||
          left(coalesce(nullif(trim(p_motif), ''), 'sans précision'), 500),
          'client');
end;
$$;

revoke all on function public.est_bloque(uuid, uuid) from public, anon;
grant execute on function public.bloquer_utilisateur(text) to authenticated;
grant execute on function public.signaler_utilisateur(text, text) to authenticated;

-- add_friend : un lien bloque (dans un sens ou dans l'autre) ne se recree pas.
-- Meme message que pour un pseudo inconnu : on ne dit pas qu'on a ete bloque.
create or replace function public.add_friend(p_handle text)
returns table(friend_id uuid, friend_handle text)
language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid   uuid := auth.uid();
  v_clean text := trim(lower(p_handle));
  v_target record;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_clean is null or v_clean = '' then raise exception 'handle_manquant'; end if;
  select id, handle into v_target from public.users where lower(handle) = v_clean limit 1;
  if v_target.id is null or public.est_bloque(v_uid, v_target.id) then raise exception 'introuvable'; end if;
  if v_target.id = v_uid then raise exception 'soi_meme'; end if;
  insert into public.friendships (user_id, friend_id) values (v_uid, v_target.id)
    on conflict (user_id, friend_id) do nothing;
  insert into public.friendships (user_id, friend_id) values (v_target.id, v_uid)
    on conflict (user_id, friend_id) do nothing;
  return query select v_target.id, v_target.handle;
end;
$function$;

create or replace function public.search_friends(p_query text)
returns table(handle text, avatar_url text)
language sql security definer set search_path to 'public' as $function$
  select u.handle, u.avatar_url
    from public.users u
   where u.id <> auth.uid()
     and length(trim(p_query)) >= 1
     and u.handle ilike trim(p_query) || '%'
     and not public.est_bloque(auth.uid(), u.id)
   order by u.handle
   limit 8;
$function$;

create or replace function public.suggest_friends()
returns table(handle text, avatar_url text)
language sql security definer set search_path to 'public' as $function$
  select u.handle, u.avatar_url
    from public.friendships mes_amis
    join public.friendships amis_d_amis on amis_d_amis.user_id = mes_amis.friend_id
    join public.users u on u.id = amis_d_amis.friend_id
   where mes_amis.user_id = auth.uid()
     and amis_d_amis.friend_id <> auth.uid()
     and not public.est_bloque(auth.uid(), u.id)
     and not exists (
       select 1 from public.friendships deja
        where deja.user_id = auth.uid() and deja.friend_id = amis_d_amis.friend_id
     )
   group by u.handle, u.avatar_url
   order by count(*) desc, u.handle
   limit 5;
$function$;
