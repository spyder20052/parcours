-- Champs nécessaires au suivi personnalisable.
alter table application add column form_text text not null default '';
alter table task add column track text;
alter table document add column tag text not null default '';
