begin;

-- Apply after the shared handovers table migration.
create table public.decisions (
    id uuid primary key default gen_random_uuid(),
    handover_id uuid not null references public.handovers (id) on delete cascade,
    decision_date date not null,
    title text not null check (char_length(btrim(title)) between 1 and 200),
    details text not null default '' check (char_length(details) <= 10000),
    decided_by uuid not null,
    created_at timestamptz not null default now()
);

create index decisions_handover_order
    on public.decisions (handover_id, decision_date desc, created_at desc, id);

create table public.handover_guides (
    handover_id uuid primary key references public.handovers (id) on delete cascade,
    content text not null check (char_length(btrim(content)) between 1 and 100000),
    status text not null default 'draft'
        check (status in ('draft', 'in_review', 'changes_requested', 'approved')),
    revision integer not null default 1 check (revision >= 1),
    submitted_by uuid,
    reviewed_by uuid,
    review_comment text check (char_length(review_comment) <= 10000),
    reviewed_at timestamptz,
    check (
        (status = 'draft' and submitted_by is null) or
        (status <> 'draft' and submitted_by is not null)
    ),
    check (
        (status in ('draft', 'in_review') and reviewed_by is null
            and reviewed_at is null and review_comment is null) or
        (status in ('changes_requested', 'approved') and reviewed_by is not null
            and reviewed_by <> submitted_by and reviewed_at is not null)
    ),
    check (
        status <> 'changes_requested' or
        (review_comment is not null and btrim(review_comment) <> '')
    )
);

alter table public.decisions enable row level security;
alter table public.handover_guides enable row level security;
revoke all on public.decisions, public.handover_guides from public, anon, authenticated;
grant select, insert on public.decisions to service_role;
grant select, insert, update on public.handover_guides to service_role;

commit;
