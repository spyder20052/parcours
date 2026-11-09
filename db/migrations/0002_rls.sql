-- Cloisonnement par utilisateur.
-- L'application lit et écrit les données métier sous le rôle parcours_app, qui ne contourne pas le RLS.
-- Chaque transaction fixe app.user_id (voir src/server/db.ts, fonction withUser).
-- Sans app.user_id, aucune ligne n'est visible.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'parcours_app') then
    create role parcours_app nologin noinherit;
  end if;
end $$;

grant parcours_app to current_user;
grant usage on schema public to parcours_app;

do $$
declare t text;
begin
  foreach t in array array['workspace','application','step','task','document','piece','thread','thread_message','ai_setting','ai_change','audit_log']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('grant select, insert, update, delete on %I to parcours_app', t);
    execute format('drop policy if exists owner_only on %I', t);
    execute format($p$create policy owner_only on %I
      using (owner_id = nullif(current_setting('app.user_id', true), ''))
      with check (owner_id = nullif(current_setting('app.user_id', true), ''))$p$, t);
  end loop;
end $$;

grant usage on sequence audit_log_id_seq to parcours_app;

-- Une ligne enfant ne peut pointer que vers un parent du même propriétaire :
-- le RLS sur le parent rend invisible tout parent étranger, et ces déclencheurs refusent l'écriture.
create or replace function parcours_same_owner() returns trigger
language plpgsql as $$
declare parent_owner text;
begin
  if TG_ARGV[0] = 'workspace' then
    select owner_id into parent_owner from workspace where id = NEW.workspace_id;
  elsif TG_ARGV[0] = 'application' then
    select owner_id into parent_owner from application where id = NEW.application_id;
  elsif TG_ARGV[0] = 'thread' then
    select owner_id into parent_owner from thread where id = NEW.thread_id;
  end if;
  if parent_owner is null or parent_owner <> NEW.owner_id then
    raise exception 'parent introuvable' using errcode = '42501';
  end if;
  return NEW;
end $$;

create trigger application_owner before insert or update on application for each row execute function parcours_same_owner('workspace');
create trigger task_owner before insert or update on task for each row execute function parcours_same_owner('workspace');
create trigger document_owner before insert or update on document for each row execute function parcours_same_owner('workspace');
create trigger piece_owner before insert or update on piece for each row execute function parcours_same_owner('workspace');
create trigger thread_owner before insert or update on thread for each row execute function parcours_same_owner('workspace');
create trigger ai_change_owner before insert or update on ai_change for each row execute function parcours_same_owner('workspace');
create trigger step_owner before insert or update on step for each row execute function parcours_same_owner('application');
create trigger thread_message_owner before insert or update on thread_message for each row execute function parcours_same_owner('thread');
