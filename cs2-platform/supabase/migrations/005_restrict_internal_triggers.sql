revoke execute on function public.on_user_created() from public, anon, authenticated;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;
-- published_players() remains intentionally callable as a read-only, published-rosters-only public API.
