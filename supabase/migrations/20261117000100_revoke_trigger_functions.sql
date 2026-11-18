-- Trigger functions don't need to be callable through the API.
revoke execute on function public.guard_last_admin() from authenticated;
revoke execute on function public.handle_interest() from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
