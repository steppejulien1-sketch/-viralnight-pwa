-- 0062 : les e-mails automatiques des commerces (03/10/2026).
-- Date du dernier rappel envoye a ce client pour ce lieu : un par semaine au
-- plus (lib/offres/rappels.js, depot B2B). Lu et ecrit par le serveur seul.
alter table public.consentements_offres add column if not exists dernier_rappel timestamptz;
