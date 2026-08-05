-- Fonction classement (SECURITY DEFINER) : contourne la RLS de `users`
-- pour exposer uniquement rank/handle/points (jamais email ni solde).
create or replace function public.get_leaderboard(p_club uuid, p_week date)
returns table (rank bigint, user_id uuid, handle text, week_points int)
language sql
security definer
set search_path = public
as $$
  select
    row_number() over (order by le.week_points desc, u.handle) as rank,
    le.user_id,
    coalesce(u.handle, 'clubbeur') as handle,
    le.week_points
  from leaderboard_entries le
  join users u on u.id = le.user_id
  where le.club_id = p_club
    and le.week_start_date = p_week
  order by le.week_points desc, u.handle;
$$;

grant execute on function public.get_leaderboard(uuid, date) to anon, authenticated;
