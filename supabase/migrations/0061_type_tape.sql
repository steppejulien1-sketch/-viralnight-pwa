-- 0061 : le type de commerce tape par le gerant (« Fleuriste », « Caviste »...)
-- quand il choisit « Autre commerce ». Recopie depuis establishments.category_label
-- (base gerants) par api/credit-clubbeur.js. Null = on affiche le type connu.
alter table public.clubs add column if not exists category_label text;
