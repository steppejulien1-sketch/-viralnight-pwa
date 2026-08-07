-- 0015 — Le club peut lire les captures qu'il doit valider.
--
-- La 0014 a pose le bucket `story-proofs` en prive avec une regle simple :
-- chacun ne lit que son propre dossier. Consequence non voulue : le gerant,
-- a qui on demande de VALIDER la capture, ne pouvait pas l'ouvrir.
--
-- ⚠️ PREMIERE TENTATIVE, ABANDONNEE : une policy qui remontait de l'objet
-- vers view_claims -> story_events -> owns_club(). Elle NE MARCHE PAS : la
-- reference `storage.objects.name` depuis la sous-requete EXISTS ne se
-- resout pas dans le contexte d'une policy. Verifie en reel — la meme
-- jointure en SQL direct renvoyait bien la ligne, mais la signature d'URL
-- par le gerant retournait 404.
--
-- SOLUTION RETENUE : mettre le club DANS LE CHEMIN.
--     story-proofs/{club_id}/{user_id}/{horodatage}.ext
-- La regle devient une simple lecture du dossier, sans jointure. Un chemin
-- bien choisi remplace une policy fragile.

-- On repart des policies de la 0014.
drop policy if exists "story proof - insert own" on storage.objects;
drop policy if exists "story proof - read own" on storage.objects;
drop policy if exists "story proof - club owner reads" on storage.objects;

-- Depot : 2e segment = son propre id. On ne verifie pas le club ici, la
-- fonction submit_story fait foi sur le rattachement.
create policy "story proof - insert own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'story-proofs'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Le clubbeur relit ses propres captures.
create policy "story proof - read own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'story-proofs'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- Le gerant lit celles de SON club, et seulement celles-la.
create policy "story proof - club owner reads" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'story-proofs'
    and public.owns_club(((storage.foldername(name))[1])::uuid)
  );
