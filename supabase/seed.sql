-- ============================================================
-- ViralNight PWA — Seed de demonstration
-- ------------------------------------------------------------
-- Un club pilote (Mirage, Bruxelles) + son catalogue de
-- recompenses. A lancer apres 0001_schema.sql.
--   supabase db reset   (applique migrations + seed)
--   ou : psql < seed.sql
-- ============================================================

-- Club pilote.
insert into public.clubs (slug, name, city, primary_color, ig_handle)
values ('mirage-brussels', 'Mirage', 'Bruxelles', '#ff6363', 'mirage.brussels')
on conflict (slug) do update
  set name = excluded.name,
      city = excluded.city,
      ig_handle = excluded.ig_handle;

-- Recompenses du club Mirage — formulations reelles, pas "Reward 1".
with c as (select id from public.clubs where slug = 'mirage-brussels')
insert into public.rewards (club_id, title, description, cost_points, sort)
select c.id, v.title, v.description, v.cost_points, v.sort
from c, (values
  ('Un cocktail offert', 'À retirer au bar principal, une fois par soirée.', 300, 1),
  ('Coupe-file garanti',       'Entrée prioritaire, sans faire la queue, avant 1h.', 600, 2),
  ('Accès carré VIP',          'Une place dans le carré, pour toi + 1.', 1200, 3),
  ('Table offerte + bouteille','Une table réservée avec une bouteille incluse.', 3000, 4)
) as v(title, description, cost_points, sort)
where not exists (
  select 1 from public.rewards r
  where r.club_id = c.id and r.title = v.title
);
