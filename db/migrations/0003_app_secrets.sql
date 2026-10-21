-- App-level secrets pasted in through the setup page (the Yahoo app's client
-- ID and secret), sealed with AES-256-GCM under TOKEN_KEY before they reach
-- the database. Server access only, like everything in this schema.
create table if not exists fantasy.app_secrets (
  name        text primary key,
  value_enc   text not null,
  hint        text,
  updated_at  timestamptz not null default now()
);
alter table fantasy.app_secrets enable row level security;
revoke all on fantasy.app_secrets from anon, authenticated;
