# Votify - Simple Poll & Voting Platform

Front-end implementation for a simple poll and voting platform, connected to Supabase.

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Supabase
- Deployment target: Vercel

## Pages Implemented

- `index.html` - Home page with public polls
- `register.html` - User registration form (name, email, password)
- `login.html` - Login form
- `dashboard.html` - Logged-in user poll management
- `create-poll.html` - Create poll form
- `edit-poll.html` - Edit existing poll
- `poll.html` - Poll details, vote actions, and result bars

## Current Behavior

- Registration and login via `users` table in Supabase
- Session persistence via `localStorage` key `votify_current_user`
- Poll CRUD via `polls` and `options` tables in Supabase
- Vote tracking via `votes` table in Supabase
- One vote per user per poll via unique index `(poll_id, user_id)`
- Result rendering with vote counts and percentage bars

## Supabase Setup

1. Open Supabase SQL Editor.
2. Run `supabase/schema.sql`.
3. Confirm the four tables exist: `users`, `polls`, `options`, `votes`.
4. Run the website.

The current frontend uses the browser Supabase SDK and the supplied project URL + anon key in `assets/js/app.js`.

## Local Storage Key

- `votify_current_user`

## Supabase Tables

### `users`

- `id` (uuid)
- `name` (text)
- `email` (text)
- `password` (text)
- `created_at` (timestamp)

### `polls`

- `id` (uuid)
- `user_id` (uuid)
- `title` (text)
- `description` (text)
- `created_at` (timestamp)

### `options`

- `id` (uuid)
- `poll_id` (uuid)
- `option_text` (text)
- `vote_count` (int)

### `votes`

- `id` (uuid)
- `poll_id` (uuid)
- `option_id` (uuid)
- `user_id` (uuid)
- `created_at` (timestamp)
