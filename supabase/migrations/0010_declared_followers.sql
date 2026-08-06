-- ============================================================
-- 0010 — Abonnes declares + capture de profil
-- ------------------------------------------------------------
-- Repli pour les comptes qu'aucune API ne sert : Instagram personnel,
-- ou clubbeur qui ne veut pas connecter son reseau. Il tape son pseudo
-- et son nombre d'abonnes, et joint une capture de son profil.
--
-- PRINCIPE : un chiffre DECLARE ne doit JAMAIS pouvoir se faire passer
-- pour un chiffre verifie. D'ou follower_source = 'declared', force par
-- la fonction et non choisi par le client. L'interface affiche
-- "declare" a cote du nombre.
--
-- Pas d'OCR ni de modele de vision ici : le chiffre est DECORATIF, il ne
-- donne aucun point (voir 0009). Monter une chaine de verification
-- payante pour un badge serait disproportionne. La capture sert de piece
-- si le club veut verifier a la main.
-- ============================================================

-- 'declared' rejoint les sources possibles.
alter table public.users drop constraint if exists users_follower_source_check;
alter table public.users
  add constraint users_follower_source_check
  check (follower_source in ('tiktok', 'instagram', 'declared'));

alter table public.users
  add column if not exists follower_proof_path text;

comment on column public.users.follower_proof_path is
  'Chemin de la capture de profil dans le bucket prive follower-proofs. '
  'Renseigne uniquement quand follower_source = declared.';

-- ------------------------------------------------------------
-- Declaration controlee
-- ------------------------------------------------------------
-- Le client ne peut pas ecrire follower_count directement (grant limite a
-- handle/email depuis 0004). Il passe par ici, ce qui garantit que
-- follower_source vaut 'declared' et rien d'autre.
create or replace function public.declare_followers(
  p_handle text,
  p_count int,
  p_proof text default null
)
returns table(handle text, follower_count int, follower_source text)
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_handle text;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  v_handle := lower(regexp_replace(coalesce(p_handle, ''), '^@', ''));
  if v_handle !~ '^[a-z0-9._]{2,30}$' then
    raise exception 'invalid_handle';
  end if;

  -- Borne haute : au-dela, c'est une saisie fantaisiste. On refuse au lieu
  -- d'accepter un nombre absurde qui decredibiliserait l'ecran.
  if p_count is null or p_count < 0 or p_count > 100000000 then
    raise exception 'invalid_count';
  end if;

  update public.users
     set handle              = v_handle,
         follower_count      = p_count,
         -- force, jamais choisi par l'appelant
         follower_source     = 'declared',
         follower_proof_path = nullif(trim(coalesce(p_proof, '')), ''),
         follower_updated_at = now()
   where id = v_uid;

  return query
    select u.handle, u.follower_count, u.follower_source
      from public.users u where u.id = v_uid;
end;
$$;

revoke all on function public.declare_followers(text, int, text) from public;
grant execute on function public.declare_followers(text, int, text) to authenticated;

-- ------------------------------------------------------------
-- Bucket prive pour les captures
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('follower-proofs', 'follower-proofs', false)
on conflict (id) do nothing;

-- Chaque clubbeur depose et relit uniquement DANS SON DOSSIER, nomme par
-- son id. Personne ne voit les captures des autres.
drop policy if exists "proof upload own folder" on storage.objects;
create policy "proof upload own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'follower-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "proof read own folder" on storage.objects;
create policy "proof read own folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'follower-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
