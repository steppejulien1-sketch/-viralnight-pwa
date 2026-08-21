-- ============================================================
-- 0033 — Photo de profil
-- ------------------------------------------------------------
-- Jusqu'ici l'avatar de la page Amis (app-preview.html) n'etait qu'un
-- rond avec l'initiale du pseudo, sans moyen de le remplacer par une
-- vraie photo. Bucket PUBLIC (contrairement a story-proofs/
-- follower-proofs, prives) : un avatar doit pouvoir s'afficher chez un
-- ami sans etre connecte a sa place. Seule l'ECRITURE reste limitee au
-- dossier de son propre uuid, comme story-proofs (0014).
-- ============================================================

alter table public.users add column if not exists avatar_url text;

-- avatar_url ne remplace pas la grille de 0004 (handle, email) : c'est
-- une extension, pas un retour en arriere sur le verrouillage des
-- colonnes sensibles (points_balance, tier, etc. restent hors d'atteinte
-- du client).
grant update (avatar_url) on public.users to authenticated;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatars - lecture publique" on storage.objects;
create policy "avatars - lecture publique" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars - depose son dossier" on storage.objects;
create policy "avatars - depose son dossier" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- Remplacer sa photo ecrase le meme fichier (upsert cote client) plutot
-- que d'empiler les versions : sans cette policy update, un second
-- upload aurait echoue en "duplicate key" a la place de remplacer.
drop policy if exists "avatars - remplace son dossier" on storage.objects;
create policy "avatars - remplace son dossier" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
