-- ============================================================
-- 0031 — Amis : table + ajout par pseudo
-- ------------------------------------------------------------
-- Jusqu'ici "Ajouter un ami" (app-preview.html) demandait un prenom
-- via window.prompt() et l'ajoutait au rail EN LOCAL SEULEMENT : rien
-- n'etait ecrit en base, l'ami disparaissait au rechargement et
-- n'existait que dans le navigateur de la personne qui l'ajoutait.
--
-- Pas de policy de lecture publique sur public.users (seule
-- "own profile - select", auth.uid() = id, existe -- voir 0001) : on ne
-- l'ouvre pas pour autant, ca exposerait tous les pseudos/emails a la
-- recherche libre. add_friend() est security definer : elle fait la
-- recherche par pseudo cote serveur, avec ses propres droits, sans
-- jamais exposer la table aux clients.
-- ============================================================

create table if not exists public.friendships (
  user_id    uuid not null references public.users(id) on delete cascade,
  friend_id  uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  constraint friendships_not_self check (user_id <> friend_id)
);
create index if not exists friendships_friend_idx on public.friendships(friend_id);

alter table public.friendships enable row level security;

-- Chacun ne lit que les lignes dont il est l'auteur -- suffisant pour
-- afficher "mes amis" (voir add_friend : la relation est ecrite dans
-- les deux sens, donc les deux personnes ont chacune leur ligne).
create policy "own friendships - select"
  on public.friendships for select using (auth.uid() = user_id);

-- Pas de policy d'insertion : ca passe uniquement par add_friend(),
-- qui valide le pseudo cote serveur plutot que de laisser un client
-- inserer n'importe quel uuid devine.

create or replace function public.add_friend(p_handle text)
returns table(friend_id uuid, friend_handle text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_clean text := trim(lower(p_handle));
  v_target record;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  if v_clean is null or v_clean = '' then
    raise exception 'handle_manquant';
  end if;

  select id, handle into v_target
    from public.users
   where lower(handle) = v_clean
   limit 1;

  if v_target.id is null then
    raise exception 'introuvable';
  end if;

  if v_target.id = v_uid then
    raise exception 'soi_meme';
  end if;

  -- Relation mutuelle : les deux sens s'ecrivent ensemble, pour que
  -- "mes amis" reste une simple lecture (une ligne par lecteur), sans
  -- jointure ni union cote client.
  insert into public.friendships (user_id, friend_id) values (v_uid, v_target.id)
    on conflict (user_id, friend_id) do nothing;
  insert into public.friendships (user_id, friend_id) values (v_target.id, v_uid)
    on conflict (user_id, friend_id) do nothing;

  return query select v_target.id, v_target.handle;
end;
$$;

revoke all on function public.add_friend(text) from public;
grant execute on function public.add_friend(text) to authenticated;

-- Liste des amis, avec leur pseudo -- meme raison d'etre que add_friend :
-- lire le handle d'un AUTRE utilisateur n'est permis qu'a travers cette
-- fonction, jamais par une lecture directe de public.users.
create or replace function public.list_friends()
returns table(friend_id uuid, friend_handle text, added_at timestamptz)
language sql security definer set search_path = public as $$
  select f.friend_id, u.handle, f.created_at
    from public.friendships f
    join public.users u on u.id = f.friend_id
   where f.user_id = auth.uid()
   order by f.created_at desc;
$$;

revoke all on function public.list_friends() from public;
grant execute on function public.list_friends() to authenticated;
