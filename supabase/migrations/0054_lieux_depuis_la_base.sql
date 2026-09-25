-- 0054 · Les lieux de l'appli viennent de la base (25/09/2026).
--
-- Jusqu'ici l'appli clubbeur avait ses lieux ecrits dans le code (Mirano et
-- trois bars de demonstration). Un etablissement qui s'inscrivait cote gerant
-- etait bien recopie dans `clubs` par api/credit-clubbeur.js, mais l'appli ne
-- venait jamais le lire : ni epingle, ni page, ni boutique.
--
-- L'appli lit desormais `clubs` au demarrage. Il lui faut, en plus de ce qui
-- existe deja (nom, ville, lat, lng, photos) : l'adresse et le type du lieu,
-- que le pont recopie depuis la base gerants.
--
-- `visible` : un lieu de test ou orphelin reste en base (des bons y sont
-- rattaches) mais n'apparait plus dans l'appli.

alter table public.clubs add column if not exists address text;
alter table public.clubs add column if not exists category text;
alter table public.clubs add column if not exists visible boolean not null default true;

-- Masques au 25/09/2026 :
--  · « Mirage » d'aout (mirage-brussels) : son etablissement gerant a ete
--    supprime lors de la remise a zero du 13/09, il est orphelin. L'appli le
--    servait par defaut quand elle ne trouvait pas le Mirano.
--  · « Chasse Gerant 13555 » : compte de test d'un script e2e.
update public.clubs set visible = false where slug in ('mirage-brussels', 'chasse-gerant-13555');
