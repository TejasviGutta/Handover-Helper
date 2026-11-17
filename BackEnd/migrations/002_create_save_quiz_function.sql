-- Saves a quiz, its source documents, and its questions in one transaction.
-- Create: p_quiz_id is null. Update: p_quiz_id is the quiz to replace.
-- On update, the question list and document list are fully replaced.
--
-- Called only by the backend (service role). The backend checks access
-- before calling, so execute is revoked from client roles.

create or replace function public.save_quiz(
  p_quiz_id uuid,
  p_handover_id uuid,
  p_owner_id uuid,
  p_title text,
  p_status text,
  p_difficulty text,
  p_document_ids uuid[],
  p_questions jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_quiz_id uuid;
begin
  if jsonb_typeof(p_questions) <> 'array' then
    raise exception 'p_questions must be a JSON array';
  end if;

  if p_quiz_id is null then
    insert into quizzes (handover_id, owner_id, title, status, difficulty, question_count)
    values (p_handover_id, p_owner_id, p_title, p_status, p_difficulty, jsonb_array_length(p_questions))
    returning id into v_quiz_id;
  else
    update quizzes
    set title = p_title,
        status = p_status,
        difficulty = p_difficulty,
        question_count = jsonb_array_length(p_questions)
    where id = p_quiz_id and handover_id = p_handover_id
    returning id into v_quiz_id;

    if v_quiz_id is null then
      raise exception 'quiz not found';
    end if;

    delete from quiz_questions where quiz_id = v_quiz_id;
    delete from quiz_documents where quiz_id = v_quiz_id;
  end if;

  insert into quiz_documents (quiz_id, document_id)
  select distinct v_quiz_id, doc_id
  from unnest(coalesce(p_document_ids, '{}')) as doc_id;

  insert into quiz_questions (
    quiz_id, position, prompt, options, correct_index,
    explanation, source_chunk_ids, is_ai_generated
  )
  select
    v_quiz_id,
    (q.ord - 1)::int,
    q.value ->> 'prompt',
    q.value -> 'options',
    (q.value ->> 'correct')::int,
    q.value ->> 'explanation',
    coalesce(
      array(select jsonb_array_elements_text(coalesce(q.value -> 'source_chunk_ids', '[]'::jsonb))),
      '{}'
    ),
    coalesce((q.value ->> 'is_ai_generated')::boolean, true)
  from jsonb_array_elements(p_questions) with ordinality as q(value, ord);

  return v_quiz_id;
end;
$$;

revoke execute on function public.save_quiz(uuid, uuid, uuid, text, text, text, uuid[], jsonb)
  from public, anon, authenticated;
grant execute on function public.save_quiz(uuid, uuid, uuid, text, text, text, uuid[], jsonb)
  to service_role;