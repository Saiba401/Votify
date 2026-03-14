-- Enable UUID extension
create extension if not exists "uuid-ossp";

--------------------------------------------------
-- USERS TABLE
--------------------------------------------------
create table if not exists users (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text unique not null,
  password text not null,
  created_at timestamp with time zone default now()
);

--------------------------------------------------
-- POLLS TABLE
--------------------------------------------------
create table if not exists polls (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references users(id) on delete cascade,
  title text not null,
  description text,
  created_at timestamp with time zone default now()
);

--------------------------------------------------
-- OPTIONS TABLE
--------------------------------------------------
create table if not exists options (
  id uuid primary key default uuid_generate_v4(),
  poll_id uuid references polls(id) on delete cascade,
  option_text text not null,
  vote_count integer default 0
);

--------------------------------------------------
-- VOTES TABLE
--------------------------------------------------
create table if not exists votes (
  id uuid primary key default uuid_generate_v4(),
  poll_id uuid references polls(id) on delete cascade,
  option_id uuid references options(id) on delete cascade,
  user_id uuid references users(id) on delete cascade,
  created_at timestamp with time zone default now()
);

--------------------------------------------------
-- PREVENT MULTIPLE VOTES PER USER PER POLL
--------------------------------------------------
create unique index if not exists unique_vote_per_user
on votes (poll_id, user_id);
