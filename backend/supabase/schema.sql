create table if not exists public.projectguard_records (
  id text primary key,
  kind text not null check (kind in ('project', 'alert', 'user', 'session')),
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists projectguard_records_kind_id_idx
  on public.projectguard_records (kind, id);

create unique index if not exists projectguard_records_user_email_unique
  on public.projectguard_records (lower(data ->> 'email'))
  where kind = 'user';

alter table public.projectguard_records enable row level security;

revoke all on public.projectguard_records from anon, authenticated;
grant all on public.projectguard_records to service_role;
