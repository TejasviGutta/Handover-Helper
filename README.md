# Handover Helper

Handover Helper is a React/Vite application for transferring project knowledge. It includes authentication, a dashboard, and a quiz builder for creating editable knowledge checks from handover documents.

## Features

- Supabase sign-in and account creation
- Dashboard navigation
- Responsive quiz builder matching the existing application design
- Editable multiple-choice questions and correct-answer selection
- Browser-based draft saving and restoration
- Learner preview with scoring and retry support
- JSON quiz export

## Local setup

1. Open `FrontEnd` in a terminal.
2. Copy `.env.example` to `.env`.
3. Add the Supabase project URL and publishable key to `.env`.
4. Install dependencies and start Vite:

```powershell
npm install
npm run dev
```

Open the address printed by Vite. The quiz builder is available at `/create-quiz` and from the Quizzes card on the dashboard.

## Validation

```powershell
npm run lint
npm run build
```

Real `.env` files, dependencies, and generated build output are intentionally excluded from Git.

## Decision log and guide review API

The API uses the existing Supabase authentication and profiles. Apply
`BackEnd/supabase/migrations/202611150001_handover_workflow.sql` after the shared
handover schema is installed. This ZIP does not include that schema. The API
expects `public.handovers` to have a UUID primary key named `id` and text
columns `departing_employee` and `incoming_employee` containing the respective
users' Supabase Auth email addresses. Participant access matches confirmed
sign-in emails, ignoring case and surrounding whitespace. Decision and review
attribution use the authenticated account's UUID.

From `BackEnd`, install its `requirements.txt`, configure `SUPABASE_URL`,
`SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the backend
environment, then run `python -m uvicorn app.main:app --reload`. Open
`http://localhost:8000/docs`. Each route requires an
`Authorization: Bearer <Supabase access token>` header.

All routes below start with `/handovers/{handover_id}`. The outgoing owner,
successor, and admins can read records. Viewers with access can only read.

| Method and path | Behavior |
| --- | --- |
| `GET /decisions` | List decisions newest first. Use `offset` and `limit` to page results. |
| `POST /decisions` | Record a decision with `title`, `decision_date` (YYYY-MM-DD), and optional `details`. The API records the signed-in user as the author. |
| `GET /guide` | Get guide content, status, revision, and latest review metadata. |
| `PUT /guide` | The outgoing owner or an admin saves `content`. Send revision `0` to create the draft or the current revision to edit a draft or a guide with requested changes. |
| `POST /guide/submit` | The outgoing owner or an admin sends the current `revision` to start a review. |
| `POST /guide/review` | The successor or an admin can request changes with a comment. The departing employee approves the final guide, including a draft they submitted themselves. Send the current `revision` and the `outcome`. |

Use the returned revision for the next mutation. A stale revision or an
invalid transition returns HTTP 409. An approved guide is read-only.

Apply `BackEnd/supabase/migrations/202611160002_allow_departing_guide_signoff.sql`
after the initial workflow migration, before deploying departing-employee
approval. It updates the guide review constraint so the departing employee can
sign off on a guide they submitted.

For local development, run FastAPI on port 8000 and Vite on port 5173. Vite
forwards frontend API requests to FastAPI. In a deployed frontend, set
`VITE_API_URL` to the backend's HTTPS origin before building. Set
`FRONTEND_ORIGIN` on the deployed backend to the frontend's HTTPS origin.
Keep the Supabase service-role key in the backend's private environment.
