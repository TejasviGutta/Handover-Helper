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
