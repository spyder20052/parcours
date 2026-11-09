-- Envoi par Outlook : pièces jointes d'un échange, conversation suivie et réponses importées.
alter table thread add column attachment_ids uuid[] not null default '{}';
alter table thread add column mail_conversation_id text;
alter table thread_message add column external_id text;
create unique index thread_message_external_idx on thread_message(owner_id, external_id) where external_id is not null;

-- Connexion Outlook d'un utilisateur. Les jetons sont chiffrés (AES-256-GCM) et la table est sous RLS.
create table mail_connection (
  owner_id text primary key references "user"(id) on delete cascade,
  provider text not null default 'microsoft' check (provider in ('microsoft')),
  account_email text not null,
  encrypted_tokens text not null,
  access_expires_at timestamptz not null,
  last_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table mail_connection enable row level security;
alter table mail_connection force row level security;
grant select, insert, update, delete on mail_connection to parcours_app;
create policy owner_only on mail_connection
  using (owner_id = nullif(current_setting('app.user_id', true), ''))
  with check (owner_id = nullif(current_setting('app.user_id', true), ''));

-- Annuaire des abonnements aux notifications de Microsoft Graph.
-- Une notification arrive sans session : cette table dit à quel utilisateur elle appartient avant d'ouvrir son espace.
-- Elle ne contient ni jeton ni contenu : l'identifiant de l'abonnement, l'empreinte SHA-256 du secret partagé et l'échéance.
-- Lue seulement par la route de notification et la tâche de renouvellement (rôle propriétaire). Aucun droit pour parcours_app.
create table mail_subscription (
  subscription_id text primary key,
  owner_id text not null unique references "user"(id) on delete cascade,
  client_state_hash text not null,
  expires_at timestamptz not null
);
revoke all on mail_subscription from parcours_app;
