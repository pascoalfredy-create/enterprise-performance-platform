create extension if not exists pgcrypto with schema extensions;

create table public.accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  identity_provider text not null default 'supabase',
  identity_subject uuid not null unique,
  email_normalized text not null unique,
  display_name text not null,
  country_code text not null,
  locale text not null default 'pt-AO',
  status text not null default 'pending_verification'
    check (status in ('pending_verification', 'active', 'blocked', 'closed')),
  email_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_email_normalized check (email_normalized = lower(trim(email_normalized))),
  constraint accounts_country_code check (country_code ~ '^[A-Z]{2}$'),
  constraint accounts_display_name check (char_length(trim(display_name)) between 2 and 120)
);

create table public.account_phones (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null unique references public.accounts(id) on delete cascade,
  calling_code text not null,
  national_number text not null,
  e164 text not null unique,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_phones_calling_code check (calling_code ~ '^\+[1-9][0-9]{0,3}$'),
  constraint account_phones_national_number check (national_number ~ '^[0-9]{4,14}$'),
  constraint account_phones_e164 check (e164 ~ '^\+[1-9][0-9]{7,14}$')
);

create table public.consents (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  policy_type text not null,
  policy_version text not null,
  granted boolean not null,
  occurred_at timestamptz not null default now(),
  evidence_hash text not null,
  source text not null default 'web_signup',
  created_at timestamptz not null default now(),
  unique (account_id, policy_type, policy_version),
  constraint consents_policy_type check (policy_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  constraint consents_policy_version check (char_length(policy_version) between 1 and 40),
  constraint consents_evidence_hash check (evidence_hash ~ '^[a-f0-9]{64}$')
);

create table public.identity_audit_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.accounts(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  entity_id text,
  event_data jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index identity_audit_events_account_time_idx
  on public.identity_audit_events (account_id, occurred_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger accounts_set_updated_at
before update on public.accounts
for each row execute function public.set_updated_at();

create trigger account_phones_set_updated_at
before update on public.account_phones
for each row execute function public.set_updated_at();

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  metadata jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  safe_name text;
  safe_country text;
  safe_locale text;
  phone_e164 text;
  phone_calling_code text;
  phone_national_number text;
  terms_version text;
  privacy_version text;
  event_time timestamptz := now();
begin
  safe_name := trim(coalesce(metadata->>'display_name', metadata->>'full_name', ''));
  if char_length(safe_name) < 2 or char_length(safe_name) > 120 then
    safe_name := split_part(coalesce(new.email, 'utilizador'), '@', 1);
  end if;

  safe_country := upper(coalesce(metadata->>'country_code', 'AO'));
  if safe_country !~ '^[A-Z]{2}$' then safe_country := 'AO'; end if;

  safe_locale := coalesce(nullif(metadata->>'locale', ''), 'pt-AO');

  insert into public.accounts (
    id, identity_provider, identity_subject, email_normalized, display_name,
    country_code, locale, status, email_verified_at
  ) values (
    new.id, 'supabase', new.id, lower(trim(new.email)), safe_name,
    safe_country, safe_locale,
    case when new.email_confirmed_at is null then 'pending_verification' else 'active' end,
    new.email_confirmed_at
  );

  phone_e164 := metadata->>'phone_e164';
  phone_calling_code := metadata->>'phone_calling_code';
  phone_national_number := metadata->>'phone_national_number';
  if phone_e164 ~ '^\+[1-9][0-9]{7,14}$'
     and phone_calling_code ~ '^\+[1-9][0-9]{0,3}$'
     and phone_national_number ~ '^[0-9]{4,14}$' then
    insert into public.account_phones (
      account_id, calling_code, national_number, e164
    ) values (
      new.id, phone_calling_code, phone_national_number, phone_e164
    );
  end if;

  terms_version := metadata->>'terms_version';
  if metadata->>'terms_accepted' = 'true' and nullif(terms_version, '') is not null then
    insert into public.consents (
      account_id, policy_type, policy_version, granted, occurred_at, evidence_hash
    ) values (
      new.id, 'terms_of_service', terms_version, true, event_time,
      encode(extensions.digest(new.id::text || '|terms_of_service|' || terms_version || '|' || event_time::text, 'sha256'), 'hex')
    );
  end if;

  privacy_version := metadata->>'privacy_version';
  if metadata->>'privacy_accepted' = 'true' and nullif(privacy_version, '') is not null then
    insert into public.consents (
      account_id, policy_type, policy_version, granted, occurred_at, evidence_hash
    ) values (
      new.id, 'privacy_policy', privacy_version, true, event_time,
      encode(extensions.digest(new.id::text || '|privacy_policy|' || privacy_version || '|' || event_time::text, 'sha256'), 'hex')
    );
  end if;

  insert into public.identity_audit_events (
    account_id, event_type, entity_type, entity_id, event_data, occurred_at
  ) values (
    new.id, 'account.registered', 'account', new.id::text,
    jsonb_build_object('country_code', safe_country, 'identity_provider', 'supabase'), event_time
  );

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_auth_user_created();

create or replace function public.handle_auth_user_updated()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.email_confirmed_at is null and new.email_confirmed_at is not null then
    update public.accounts
       set email_verified_at = new.email_confirmed_at,
           status = case when status = 'pending_verification' then 'active' else status end
     where id = new.id;

    insert into public.identity_audit_events (
      account_id, event_type, entity_type, entity_id, event_data
    ) values (
      new.id, 'account.email_verified', 'account', new.id::text, '{}'::jsonb
    );
  end if;

  if old.email is distinct from new.email then
    update public.accounts
       set email_normalized = lower(trim(new.email))
     where id = new.id;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_updated
after update on auth.users
for each row execute function public.handle_auth_user_updated();

alter table public.accounts enable row level security;
alter table public.account_phones enable row level security;
alter table public.consents enable row level security;
alter table public.identity_audit_events enable row level security;

create policy accounts_select_self on public.accounts
for select to authenticated using ((select auth.uid()) = id);

create policy accounts_update_self on public.accounts
for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy account_phones_select_self on public.account_phones
for select to authenticated using ((select auth.uid()) = account_id);

create policy account_phones_insert_self on public.account_phones
for insert to authenticated with check ((select auth.uid()) = account_id);

create policy account_phones_update_self on public.account_phones
for update to authenticated
using ((select auth.uid()) = account_id)
with check ((select auth.uid()) = account_id);

create policy consents_select_self on public.consents
for select to authenticated using ((select auth.uid()) = account_id);

revoke all on public.accounts from anon, authenticated;
revoke all on public.account_phones from anon, authenticated;
revoke all on public.consents from anon, authenticated;
revoke all on public.identity_audit_events from anon, authenticated;

grant select on public.accounts to authenticated;
grant update (display_name, country_code, locale) on public.accounts to authenticated;
grant select on public.account_phones to authenticated;
grant insert (account_id, calling_code, national_number, e164) on public.account_phones to authenticated;
grant update (calling_code, national_number, e164) on public.account_phones to authenticated;
grant select on public.consents to authenticated;

comment on table public.accounts is 'Public identity projection; authentication credentials remain in auth.users.';
comment on table public.consents is 'Immutable evidence of policy consent. Direct client writes are intentionally disabled.';
comment on table public.identity_audit_events is 'Server-managed append-only identity audit trail.';
