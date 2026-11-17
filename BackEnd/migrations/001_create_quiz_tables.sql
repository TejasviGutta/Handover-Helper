-- Quiz tables. Column names follow the frontend question shape
-- ({prompt, options, correct}) so mapping stays simple.
-- Depends on existing tables: public.handovers, public.documents.

create table if not exists public.quizzes (
  id uuid primary key default gen_random_uuid(),
  handover_id uuid not null references public.handovers(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  status text not null default 'draft' check (status in ('draft', 'published')),
  difficulty text not null default 'balanced'
    check (difficulty in ('foundational', 'balanced', 'in_depth')),
  question_count int not null default 0 check (question_count between 0 and 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Which documents a quiz was generated from.
create table if not exists public.quiz_documents (
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  primary key (quiz_id, document_id)
);

create table if not exists public.quiz_questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  position int not null check (position >= 0),
  prompt text not null default '' check (char_length(prompt) <= 500),  -- drafts may be incomplete
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) = 4),
  correct_index int not null check (correct_index between 0 and 3),
  explanation text,
  source_chunk_ids text[] not null default '{}',
  is_ai_generated boolean not null default true,
  created_at timestamptz not null default now(),
  unique (quiz_id, position)
);

create table if not exists public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  answers jsonb not null,            -- [{"question_id": "...", "selected_index": 2}]
  score int not null check (score >= 0),
  total int not null check (total > 0 and score <= total),
  completed_at timestamptz not null default now()
);

create index if not exists quizzes_handover_idx on public.quizzes (handover_id);
create index if not exists quizzes_owner_idx on public.quizzes (owner_id);
create index if not exists quiz_documents_document_idx on public.quiz_documents (document_id);
create index if not exists quiz_questions_quiz_idx on public.quiz_questions (quiz_id);
create index if not exists quiz_attempts_quiz_user_idx on public.quiz_attempts (quiz_id, user_id);

-- Quiz-specific name so an existing shared trigger function is never overwritten.
create or replace function public.quizzes_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists quizzes_touch_updated_at on public.quizzes;
create trigger quizzes_touch_updated_at
  before update on public.quizzes
  for each row execute function public.quizzes_touch_updated_at();

-- Row level security.
-- Access = quiz owner, or the user who created the handover.
-- TODO(team): handovers has no user id for the incoming person yet.
-- Once it exists, add it here so that person can read and take the quiz.
alter table public.quizzes enable row level security;
alter table public.quiz_documents enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts enable row level security;

create or replace function public.can_access_quiz(target_quiz uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from quizzes q
    join handovers h on h.id = q.handover_id
    where q.id = target_quiz
     and (q.owner_id = auth.uid() or h.created_by = auth.uid())
  );
$$;

create policy "quiz access" on public.quizzes
  for all using (public.can_access_quiz(id))
  with check (
    owner_id = auth.uid()
    and exists (select 1 from public.handovers h where h.id = handover_id and h.created_by = auth.uid())
  );

create policy "quiz documents access" on public.quiz_documents
  for all using (public.can_access_quiz(quiz_id))
  with check (public.can_access_quiz(quiz_id));

create policy "quiz questions access" on public.quiz_questions
  for all using (public.can_access_quiz(quiz_id))
  with check (public.can_access_quiz(quiz_id));

-- Attempts are inserted by the backend after server-side grading,
-- so users can only read their own attempts.
create policy "users read their own attempts" on public.quiz_attempts
  for select using (user_id = auth.uid());