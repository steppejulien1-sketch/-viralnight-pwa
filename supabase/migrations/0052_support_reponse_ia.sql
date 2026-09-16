-- 0052 : la reponse automatique du support.
--
-- Julien, 16/09/2026 : « une IA qui repond automatiquement quand le client a
-- un probleme ». La reponse est ecrite par le site (api/credit-clubbeur.js,
-- cle service_role) dans le meme fil que le client, avec son propre auteur :
-- « ia ». Le tableau de bord distingue ainsi ce que Julien a ecrit de ce que
-- la machine a repondu, et l'IA se tait quand Julien a repris la main.
--
-- Rien ne change pour le client : sa policy d'insertion exige toujours
-- auteur = 'client', il ne peut pas fabriquer une reponse « ia ».

alter table public.support_messages drop constraint if exists support_messages_auteur_check;
alter table public.support_messages
  add constraint support_messages_auteur_check check (auteur in ('client', 'admin', 'ia'));
