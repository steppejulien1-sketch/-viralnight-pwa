-- 0053 · Les photos d'un etablissement, cote clubbeur (17/09/2026).
--
-- Julien : « la facade comme photo, et quand on clique sur la photo, ca change
-- de photo ». Le gerant depose sa facade (clubs.logo_url, deja recopiee) et
-- jusqu'a quatre autres photos dans son parcours d'installation
-- (establishments.photos, base B2B). api/credit-clubbeur.js les recopie ici a
-- chaque synchro de boutique ; l'appli clubbeur les fait defiler au toucher
-- sur la page de l'etablissement.
--
-- Colonne lisible comme le reste de la ligne (les clubs sont publics), jamais
-- ecrite par un client : seule la cle service_role du pont l'alimente.

alter table public.clubs add column if not exists photos text[] not null default '{}';
