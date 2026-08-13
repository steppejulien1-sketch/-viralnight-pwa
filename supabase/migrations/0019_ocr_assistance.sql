-- ============================================================
-- 0019 — Lecture assistee de la capture (OCR), SANS credit
-- ------------------------------------------------------------
-- L'edge function ocr-screenshot, telle qu'elle existait, etait un
-- danger et non un brouillon :
--   1. elle INVENTAIT le nombre de vues (2000 + random * 14000) ;
--   2. elle passait le claim en 'approved' toute seule, court-circuitant
--      la validation par le club mise en place par la 0014 ;
--   3. elle ecrivait users.points_balance EN DIRECT, court-circuitant
--      point_grants et le blocage de 12 h de la 0011 ;
--   4. elle ne verifiait pas que l'appelant avait le moindre droit sur
--      le claim -- n'importe quel clubbeur connecte pouvait se crediter.
--
-- NOUVEAU ROLE : l'OCR ne decide rien. Il LIT la capture et PROPOSE un
-- chiffre au gerant, affiche a cote de celui declare par le clubbeur.
-- C'est le gerant qui tranche, et review_story() reste le seul chemin
-- qui credite.
--
-- ⚠️ POURQUOI UNE COLONNE SEPAREE ET NON extracted_views
-- review_story fait `coalesce(p_views, extracted_views)`. Ecrire le
-- resultat de l'OCR dans extracted_views changerait donc le montant
-- verse si le gerant valide sans toucher au champ. La declaration du
-- clubbeur doit rester intacte : c'est la piece qui documente l'ecart.
-- ============================================================

alter table public.view_claims add column if not exists ocr_views  integer
  check (ocr_views is null or ocr_views >= 0);
alter table public.view_claims add column if not exists ocr_at     timestamptz;
alter table public.view_claims add column if not exists ocr_error  text;

comment on column public.view_claims.ocr_views is
  'Nombre de vues LU sur la capture, a titre indicatif. Ne credite rien '
  'et n''ecrase jamais extracted_views (la declaration du clubbeur).';

-- ------------------------------------------------------------
-- La file du club expose le chiffre lu a cote du chiffre declare
-- ------------------------------------------------------------
-- Changer le type de retour impose de supprimer d'abord.
drop function if exists public.get_pending_stories(uuid);

create or replace function public.get_pending_stories(p_club uuid)
returns table(
  story_id uuid,
  handle text,
  kind text,
  declared_views integer,
  ocr_views integer,
  ocr_error text,
  proof_path text,
  url text,
  submitted_at timestamptz
)
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not public.owns_club(p_club) then raise exception 'not_owner'; end if;

  return query
  select s.id, u.handle, s.kind, c.extracted_views, c.ocr_views, c.ocr_error,
         c.screenshot_url, s.url, s.mentioned_at
    from public.story_events s
    join public.view_claims c on c.story_event_id = s.id
    join public.users u on u.id = s.user_id
   where s.club_id = p_club
     and s.verified = false
     and c.status = 'pending'
   order by s.mentioned_at;
end;
$function$;

grant execute on function public.get_pending_stories(uuid) to authenticated;

-- ------------------------------------------------------------
-- ⚠️ Rappel du verrou de la 0014
-- ------------------------------------------------------------
-- CREATE OR REPLACE reattribue les droits par defaut. La revocation de
-- credit_story doit etre REPOSEE apres toute redefinition, sinon le
-- verrou anti-auto-credit saute en silence. Elle ne concerne pas la
-- fonction ci-dessus, mais la regle a deja coute une migration (0016) :
-- on la reverifie ici.
revoke execute on function public.credit_story(uuid, text, integer, text) from anon, authenticated;
