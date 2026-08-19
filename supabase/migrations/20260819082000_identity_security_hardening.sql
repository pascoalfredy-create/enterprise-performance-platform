revoke execute on function public.handle_auth_user_created() from public, anon, authenticated;
revoke execute on function public.handle_auth_user_updated() from public, anon, authenticated;

create policy identity_audit_events_no_client_access
on public.identity_audit_events
for all
to anon, authenticated
using (false)
with check (false);

comment on policy identity_audit_events_no_client_access on public.identity_audit_events
  is 'Explicit deny: audit records are available only through trusted server-side administration.';
