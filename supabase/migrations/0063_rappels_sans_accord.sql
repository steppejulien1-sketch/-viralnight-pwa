-- 0063 : e-mails des commerces sans case a cocher (03/10/2026, Julien).
-- L'accord est donne a la creation du compte (CGU, article 12) ; les e-mails
-- vont aux clients venus dans le lieu (point_grants), sauf ceux qui ont dit
-- non (consentements_offres.accepte = false, ou lien de desabonnement).
-- rappels_auto : date du dernier rappel par (client, lieu), un par semaine.
-- Remplace consentements_offres.dernier_rappel (0062), qui ne couvrait que
-- les clients ayant coche la case.
create table if not exists public.rappels_auto (
  user_id    uuid not null references public.users(id) on delete cascade,
  club_id    uuid not null references public.clubs(id) on delete cascade,
  envoye_le  timestamptz not null default now(),
  primary key (user_id, club_id)
);
alter table public.rappels_auto enable row level security;
-- Aucune policy : seul le serveur (service_role) lit et ecrit.
