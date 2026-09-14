-- ============================================================
-- 0048 — Une mention en story, recue d'Instagram, valide la story
-- ------------------------------------------------------------
-- 14/09/2026. Deux decouvertes en configurant l'app Meta avec Julien :
--
-- 1. LE BRANCHEMENT ECOUTAIT LE MAUVAIS EVENEMENT. Le champ webhook
--    `mentions` couvre les @mentions dans les COMMENTAIRES et les LEGENDES.
--    Une mention en story arrive par la messagerie Instagram (champ
--    `messages`, piece jointe `story_mention`). Aucune story n'aurait
--    jamais ete detectee.
--
-- 2. DEUX PRIX POUR LA MEME STORY. L'ancien credit automatique payait un
--    forfait a part (crediter_mention_instagram, 50 par defaut), en plus de
--    la story declaree dans l'appli (100, validee a la main ou a 24 h). La
--    meme soiree pouvait donc etre payee deux fois.
--
-- Desormais une mention recue ne cree PAS de credit parallele : elle trouve
-- la story du clubbeur pour cette soiree (ou la cree s'il ne l'a pas
-- declaree) et la fait valider par le chemin commun (pilotage_review_story,
-- appele cote Node pour que le clubbeur soit notifie). Meme prix, meme
-- regle « une story par soiree », une seule trace.
-- ============================================================

-- Toutes les mentions recues, attribuees ou non : c'est ce qui permet de
-- comprendre pourquoi une story n'a pas ete creditee (pseudo inconnu, deja
-- une story ce soir-la...). Ecrit par api/instagram.js avec la cle service.
create table if not exists public.instagram_story_mentions (
  mid             text primary key,           -- identifiant du message Instagram : Meta redelivre, on ne traite qu'une fois
  ig_compte       text not null,              -- compte Instagram professionnel mentionne (entry.id)
  club_id         uuid references public.clubs(id) on delete set null,
  expediteur      text,                       -- IGSID de l'auteur de la story
  username        text,                       -- son pseudo, lu par l'API
  user_id         uuid references public.users(id) on delete set null,
  story_event_id  uuid references public.story_events(id) on delete set null,
  statut          text not null default 'recue',
  signature_ok    boolean,
  recu_le         timestamptz not null default now()
);
create index if not exists instagram_story_mentions_recu_idx on public.instagram_story_mentions (recu_le desc);
alter table public.instagram_story_mentions enable row level security;

alter table public.story_events
  add column if not exists verifie_instagram boolean not null default false;

/* La story de ce clubbeur pour la soiree de la mention.
   - une story en attente cette soiree-la      -> on la renvoie, a valider ;
   - une story deja validee ou refusee          -> rien (pas de second credit,
     et un refus reste un refus) ;
   - aucune story                               -> on la cree, a valider.
   Ne valide rien elle-meme : la validation passe par pilotage_review_story,
   appelee par le serveur, qui notifie le clubbeur. */
create or replace function public.story_detectee_instagram(p_user uuid, p_club uuid, p_at timestamptz)
returns table(story_id uuid, statut text)
language plpgsql security definer set search_path = public as $$
declare
  v_soiree date := public.soiree_de(coalesce(p_at, now()));
  v_story record;
  v_id uuid;
begin
  select s.id, s.verified, s.review_status
    into v_story
    from public.story_events s
   where s.user_id = p_user
     and public.soiree_de(s.mentioned_at) = v_soiree
   order by (s.review_status is null and not s.verified) desc, s.mentioned_at
   limit 1
   for update;

  if found then
    update public.story_events set verifie_instagram = true where id = v_story.id;
    if v_story.review_status is null and not v_story.verified then
      return query select v_story.id, 'a_valider'::text;
    elsif v_story.review_status = 'refusee' then
      return query select v_story.id, 'deja_refusee'::text;
    else
      return query select v_story.id, 'deja_validee'::text;
    end if;
    return;
  end if;

  insert into public.story_events (user_id, club_id, kind, base_points, awarded_points, views, verified, mentioned_at, verifie_instagram)
  values (p_user, p_club, 'story', 0, 0, 0, false, coalesce(p_at, now()), true)
  returning id into v_id;

  -- Comme submit_story : la ligne view_claims porte le statut du depot.
  insert into public.view_claims (story_event_id, user_id, screenshot_url, extracted_views, status)
  values (v_id, p_user, null, 0, 'pending');

  return query select v_id, 'creee'::text;
end $$;

revoke all on function public.story_detectee_instagram(uuid, uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.story_detectee_instagram(uuid, uuid, timestamptz) to service_role;
