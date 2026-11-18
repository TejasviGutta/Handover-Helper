begin;

set local lock_timeout = '5s';

-- The original migration generated this name for its second table check.
alter table public.handover_guides drop constraint handover_guides_check1;

alter table public.handover_guides
    add constraint handover_guides_review_metadata_check check (
        (status in ('draft', 'in_review') and reviewed_by is null
            and reviewed_at is null and review_comment is null) or
        (status in ('changes_requested', 'approved') and reviewed_by is not null
            and reviewed_at is not null
            and (status = 'approved' or reviewed_by <> submitted_by))
    );

commit;
