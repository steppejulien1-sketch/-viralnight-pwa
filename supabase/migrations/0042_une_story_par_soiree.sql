-- ============================================================
-- 0042 — Une story par soiree
-- ------------------------------------------------------------
-- La regle est ECRITE dans l'appli depuis le 06/09/2026, sous le bouton
-- « J'ai poste » (.ps-regle dans app-preview.html), mais rien ne
-- l'appliquait : il suffisait de renvoyer le formulaire pour deposer
-- autant de stories qu'on voulait dans la meme nuit. Julien, en la
-- listant parmi les choses a ajouter : « une story par soiree ».
--
-- ⚠️ CE QUI EXISTAIT NE SUFFISAIT PAS. submit_story() refusait deja un
-- second depot, mais seulement s'il etait NON VERIFIE, sur le MEME CLUB
-- et datant de moins de 12 heures (`already_pending`). Trois trous :
-- une story validee liberait aussitot la place, un second club en
-- ouvrait une autre, et 12 heures ne sont pas une soiree.
--
-- UNE SOIREE VA DE 6 H A 6 H, pas de minuit a minuit : une story postee
-- a 2 h du matin appartient a la soiree de la veille. C'est le meme
-- principe que resolve_event_night() cote gerant ("une soiree du samedi
-- soir finit le dimanche matin"), en plus simple -- la version d'ici ne
-- peut pas dependre des horaires d'ouverture d'un club, ils vivent dans
-- l'autre base.
--
-- EN HEURE DE BRUXELLES, comme lib/scheduling/nightDate.js (DEFAULT_
-- TIMEZONE). La base tourne en UTC : la coupure de 6 h y tomberait a 8 h
-- l'ete et 7 h l'hiver, et changerait deux fois par an.
--
-- ⚠️ UN REFUS REND LA SOIREE. Si le gerant rejette le depot, la personne
-- doit pouvoir en refaire un -- sinon une capture floue coute la nuit
-- entiere. Seuls les depots `pending` et `approved` bloquent.
-- ============================================================

create or replace function public.soiree_de(p_at timestamptz default now())
returns date
language sql stable as $$
  select case
    when (p_at at time zone 'Europe/Brussels')::time < time '06:00'
      then (p_at at time zone 'Europe/Brussels')::date - 1
    else (p_at at time zone 'Europe/Brussels')::date
  end;
$$;

comment on function public.soiree_de is
  'La soiree a laquelle appartient un instant : de 6 h a 6 h, heure de '
  'Bruxelles. Miroir simplifie de resolve_event_night() cote gerant.';

-- Un index qui sert la verification ci-dessous : sans lui, chaque depot
-- balaierait toutes les stories de la personne.
create index if not exists story_events_user_soiree_idx
  on public.story_events (user_id, (public.soiree_de(mentioned_at)));

create or replace function public.submit_story(
  p_club uuid, p_kind text, p_views integer, p_proof text, p_url text default null
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_kind text;
  v_id uuid;
  v_views int;
  v_proof text;
  v_url text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  v_kind := lower(coalesce(p_kind, ''));
  if v_kind not in ('story', 'reel', 'tiktok') then
    raise exception 'invalid_kind';
  end if;

  v_proof := nullif(btrim(coalesce(p_proof, '')), '');
  v_url   := nullif(btrim(coalesce(p_url, '')), '');

  -- ⚠️ PLUS AUCUNE CAPTURE EXIGÉE (0028). Ne pas réintroduire ce contrôle
  -- sans avoir d'abord retiré le lien obligatoire ci-dessous : les deux
  -- forment une seule règle, « tout contenu doit porter de quoi être
  -- vérifié ».
  if v_kind <> 'story' and v_url is null then
    raise exception 'url_required';
  end if;

  v_views := greatest(coalesce(p_views, 0), 0);
  if v_views > 1000000 then v_views := 1000000; end if;

  /* UNE STORY PAR SOIREE, tous clubs confondus.
     Tous clubs confondus parce que c'est ce que la regle affichee
     promet, et parce que compter par club rouvrirait le trou des le
     deuxieme club de la ville. Quelqu'un qui enchaine reellement deux
     clubs dans la nuit ne pourra donc en declarer qu'un : c'est le prix
     de la regle, et il est assume.

     Un depot rejete ne compte pas (voir l'entete). */
  if exists (
    select 1
      from public.story_events s
      left join public.view_claims v on v.story_event_id = s.id
     where s.user_id = v_uid
       and public.soiree_de(s.mentioned_at) = public.soiree_de(now())
       and coalesce(v.status, 'pending'::claim_status) <> 'rejected'::claim_status
  ) then
    raise exception 'deja_ce_soir';
  end if;

  -- Garde-fou d'abus conserve : il attrape le double-tap et les deux
  -- onglets, que la regle de soiree ci-dessus laisse passer pendant les
  -- quelques millisecondes qui separent la lecture de l'insertion.
  if exists (
    select 1 from public.story_events s
     where s.user_id = v_uid
       and s.club_id = p_club
       and s.verified = false
       and s.mentioned_at > now() - interval '12 hours'
  ) then
    raise exception 'already_pending';
  end if;

  insert into public.story_events
    (user_id, club_id, kind, url, base_points, awarded_points, views, verified)
  values
    (v_uid, p_club, v_kind, v_url, 0, 0, v_views, false)
  returning id into v_id;

  -- ⚠️ La ligne `view_claims` existe MÊME SANS CAPTURE : elle porte le
  -- statut, et `get_pending_stories` fait sa jointure dessus. Sans elle,
  -- le dépôt n'apparaîtrait JAMAIS dans la file du gérant.
  insert into public.view_claims
    (story_event_id, user_id, screenshot_url, extracted_views, status)
  values
    (v_id, v_uid, v_proof, v_views, 'pending');

  return v_id;
end;
$$;

comment on function public.submit_story is
  'Depot d''une story. UNE PAR SOIREE (6 h a 6 h, heure de Bruxelles), '
  'tous clubs confondus ; un depot rejete rend la soiree. Leve '
  'deja_ce_soir sinon.';

-- ------------------------------------------------------------
-- L'appli a besoin de savoir AVANT d'afficher le formulaire
-- ------------------------------------------------------------
-- Sans ca, la personne remplit tout, appuie, et se prend un refus. La
-- regle doit se voir avant l'effort, pas apres.
create or replace function public.story_du_soir()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_id  uuid;
begin
  if v_uid is null then
    return jsonb_build_object('etat', 'non_connecte');
  end if;

  select s.id into v_id
    from public.story_events s
    left join public.view_claims v on v.story_event_id = s.id
   where s.user_id = v_uid
     and public.soiree_de(s.mentioned_at) = public.soiree_de(now())
     and coalesce(v.status, 'pending'::claim_status) <> 'rejected'::claim_status
   limit 1;

  if v_id is null then
    return jsonb_build_object('etat', 'possible', 'soiree', public.soiree_de(now()));
  end if;

  return jsonb_build_object('etat', 'deja_postee', 'soiree', public.soiree_de(now()));
end;
$$;

grant execute on function public.story_du_soir() to authenticated;
grant execute on function public.soiree_de(timestamptz) to authenticated;
