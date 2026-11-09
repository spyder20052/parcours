-- Parcours : schéma initial.
-- Les tables d'authentification servent Better Auth et ne sont lues que par le serveur.
-- Les tables métier portent owner_id et sont cloisonnées par RLS (voir 0002_rls.sql).

create extension if not exists pgcrypto;

-- ---------- Authentification (Better Auth)
create table "user" (
  id text primary key,
  name text not null default '',
  email text not null unique,
  email_verified boolean not null default false,
  image text,
  role text not null default 'user' check (role in ('user', 'admin')),
  disabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table session (
  id text primary key,
  user_id text not null references "user"(id) on delete cascade,
  token text not null unique,
  expires_at timestamptz not null,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index session_user_idx on session(user_id);

create table account (
  id text primary key,
  user_id text not null references "user"(id) on delete cascade,
  account_id text not null,
  provider_id text not null,
  access_token text,
  refresh_token text,
  id_token text,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  scope text,
  password text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index account_user_idx on account(user_id);

create table verification (
  id text primary key,
  identifier text not null,
  value text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index verification_identifier_idx on verification(identifier);

create table rate_limit (
  id text primary key,
  key text not null unique,
  count integer not null,
  last_request bigint not null
);

-- Liste des e-mails autorisés à créer un compte.
create table invitation (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  invited_by text references "user"(id) on delete set null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index invitation_email_idx on invitation(lower(email));

-- ---------- Données de chaque utilisateur
create table workspace (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references "user"(id) on delete cascade,
  name text not null,
  template text,
  config jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workspace_owner_idx on workspace(owner_id);

create table application (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references "user"(id) on delete cascade,
  workspace_id uuid not null references workspace(id) on delete cascade,
  university text not null,
  program text not null,
  long_title text not null default '',
  tier text not null default 'prio',
  variant text not null default '',
  stage text not null default 'prepare',
  conditions text not null default '',
  channel text not null default '',
  procedure_url text not null default '',
  program_url text not null default '',
  notes text not null default '',
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index application_ws_idx on application(workspace_id);

create table step (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references "user"(id) on delete cascade,
  application_id uuid not null references application(id) on delete cascade,
  label text not null,
  kind text not null default 'depot',
  due_date date,
  is_target boolean not null default false,
  note text not null default '',
  how jsonb,
  done_at timestamptz,
  position integer not null default 0
);
create index step_app_idx on step(application_id);

create table task (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references "user"(id) on delete cascade,
  workspace_id uuid not null references workspace(id) on delete cascade,
  application_id uuid references application(id) on delete set null,
  label text not null,
  due_date date,
  how jsonb,
  done_at timestamptz,
  position integer not null default 0
);
create index task_ws_idx on task(workspace_id);

create table document (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references "user"(id) on delete cascade,
  workspace_id uuid not null references workspace(id) on delete cascade,
  application_id uuid references application(id) on delete set null,
  folder text not null default 'divers',
  title text not null,
  subtitle text not null default '',
  object_key text not null unique,
  mime text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 15728640),
  sha256 text,
  sensitive boolean not null default false,
  warning text not null default '',
  status text not null default 'pending' check (status in ('pending', 'ready')),
  created_at timestamptz not null default now()
);
create index document_ws_idx on document(workspace_id);

create table piece (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references "user"(id) on delete cascade,
  workspace_id uuid not null references workspace(id) on delete cascade,
  label text not null,
  status text not null default 'attendue',
  who text not null default '',
  note text not null default '',
  link text not null default '',
  how jsonb,
  document_id uuid references document(id) on delete set null,
  position integer not null default 0
);
create index piece_ws_idx on piece(workspace_id);

create table thread (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references "user"(id) on delete cascade,
  workspace_id uuid not null references workspace(id) on delete cascade,
  application_id uuid references application(id) on delete set null,
  title text not null,
  recipient text not null default '',
  subject text not null default '',
  body text not null default '',
  kind text not null default 'premier_contact',
  sent_at date,
  position integer not null default 0
);
create index thread_ws_idx on thread(workspace_id);

create table thread_message (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references "user"(id) on delete cascade,
  thread_id uuid not null references thread(id) on delete cascade,
  direction text not null default 'in' check (direction in ('in', 'out')),
  raw_text text not null,
  received_on date not null default current_date,
  created_at timestamptz not null default now()
);
create index thread_message_thread_idx on thread_message(thread_id);

create table ai_setting (
  owner_id text primary key references "user"(id) on delete cascade,
  encrypted_key text,
  model text not null default 'claude-opus-5-5',
  updated_at timestamptz not null default now()
);

create table ai_change (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references "user"(id) on delete cascade,
  workspace_id uuid not null references workspace(id) on delete cascade,
  prompt text not null,
  summary text not null default '',
  operations jsonb not null,
  inverse jsonb,
  applied_at timestamptz,
  reverted_at timestamptz,
  created_at timestamptz not null default now()
);
create index ai_change_ws_idx on ai_change(workspace_id);

create table audit_log (
  id bigserial primary key,
  owner_id text references "user"(id) on delete cascade,
  action text not null,
  detail jsonb,
  created_at timestamptz not null default now()
);

create table app_rate_limit (
  key text primary key,
  count integer not null,
  reset_at timestamptz not null
);
