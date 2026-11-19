begin;
create table public.handover_members (
    handover_id uuid not null references public.handovers (id) on delete cascade,
    user_id uuid not null references auth.users (id) on delete cascade,
    role text not null default 'viewer' check (role in ('viewer', 'contributor')),
    added_by uuid,
    added_at timestamptz not null default now(),
    primary key (handover_id, user_id)
);

create index handover_members_user on public.handover_members (user_id);

alter table public.handover_members enable row level security;
revoke all on public.handover_members from public, anon, authenticated;
grant select, insert, update, delete on public.handover_members to service_role;

commit;