-- =====================================================================
-- Charge Duett – Grundschema (Supabase / Postgres 15+ / PostGIS)
-- =====================================================================
-- Prinzipien:
--  * Kein Client liest fremde Standorte, Geburtsdaten oder Sessions direkt.
--    Alles, was andere Nutzer betrifft, läuft über SECURITY-DEFINER-RPCs,
--    die nur das Nötigste (Alter statt Geburtsdatum, Entfernungs-Stufe statt
--    Koordinate) herausgeben.
--  * Row Level Security ist auf ALLEN Tabellen aktiv.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists postgis with schema extensions;

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------
create type public.app_mode as enum ('friendship', 'networking', 'dating');
create type public.gender as enum ('female', 'male', 'diverse');
create type public.swipe_direction as enum ('like', 'pass');
create type public.report_status as enum ('open', 'reviewed', 'actioned', 'dismissed');
create type public.consent_type as enum (
  'terms',                 -- AGB
  'privacy',               -- Datenschutzerklärung gelesen
  'location',              -- Standortverarbeitung für Check-in
  'data_sharing',          -- anonymisierte Weitergabe von Lade-/Fahrzeugdaten an Dritte
  'ads_personalization'    -- personalisierte Werbung
);

-- ---------------------------------------------------------------------
-- Admins (Moderation durch Strauss Media GmbH)
-- ---------------------------------------------------------------------
create table public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------
-- Profile
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 30),
  birthdate date not null,
  gender public.gender not null,
  bio text check (char_length(bio) <= 500),
  occupation text check (char_length(occupation) <= 60),
  modes public.app_mode[] not null default array['friendship', 'networking']::public.app_mode[]
    check (cardinality(modes) >= 1),
  -- Nur für Dating-Modus relevant
  dating_genders public.gender[] not null default array[]::public.gender[],
  age_min smallint not null default 18 check (age_min >= 18),
  age_max smallint not null default 99 check (age_max <= 99),
  photos text[] not null default array[]::text[] check (cardinality(photos) <= 6),
  locale text not null default 'de' check (locale in ('de', 'en')),
  is_banned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (age_min <= age_max)
);

create or replace function public.enforce_profile_rules()
returns trigger
language plpgsql
as $$
begin
  if new.birthdate > (current_date - interval '18 years')::date then
    raise exception 'UNDERAGE' using errcode = 'P0001';
  end if;
  if new.birthdate < date '1920-01-01' then
    raise exception 'INVALID_BIRTHDATE' using errcode = 'P0001';
  end if;
  -- Nutzer dürfen sich nicht selbst entsperren
  if tg_op = 'UPDATE' and old.is_banned and not new.is_banned and not public.is_admin() then
    new.is_banned := true;
  end if;
  if tg_op = 'INSERT' and new.is_banned and not public.is_admin() then
    new.is_banned := false;
  end if;
  -- Geburtsdatum nach Anlage nicht mehr änderbar (Schutz vor Alters-Tricks)
  if tg_op = 'UPDATE' and new.birthdate <> old.birthdate and not public.is_admin() then
    raise exception 'BIRTHDATE_LOCKED' using errcode = 'P0001';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_rules
before insert or update on public.profiles
for each row execute function public.enforce_profile_rules();

create or replace function public.age_of(d date)
returns int language sql immutable as $$
  select extract(year from age(current_date, d))::int;
$$;

-- ---------------------------------------------------------------------
-- Einwilligungen (Protokoll, nie überschreiben – nur neue Zeilen)
-- ---------------------------------------------------------------------
create table public.consents (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  type public.consent_type not null,
  granted boolean not null,
  version text not null,
  created_at timestamptz not null default now()
);
create index consents_user_type_idx on public.consents (user_id, type, created_at desc);

create or replace function public.has_consent(p_user uuid, p_type public.consent_type)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce((
    select granted from public.consents
    where user_id = p_user and type = p_type
    order by created_at desc, id desc
    limit 1
  ), false);
$$;

-- ---------------------------------------------------------------------
-- Fahrzeug-Stammdaten (feste Liste, gepflegt durch Admins)
-- ---------------------------------------------------------------------
create table public.vehicle_models (
  id serial primary key,
  make text not null,
  model text not null,
  variant text not null default '',
  body_type text,                  -- SUV, Limousine, Kompakt, Kombi, Van, Kleinwagen, Pickup
  year_from smallint,
  year_to smallint,                -- null = aktuell
  battery_kwh_net numeric(5,1),
  dc_max_kw smallint,
  ac_max_kw numeric(4,1),
  wltp_range_km smallint,
  is_active boolean not null default true,
  unique (make, model, variant)
);
create index vehicle_models_search_idx on public.vehicle_models (lower(make), lower(model));

-- Fahrzeuge der Nutzer
create table public.user_vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  model_id int not null references public.vehicle_models (id),
  nickname text check (char_length(nickname) <= 30),
  description text check (char_length(description) <= 300),
  model_year smallint check (model_year between 2010 and 2035),
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index user_vehicles_user_idx on public.user_vehicles (user_id);
create unique index user_vehicles_one_primary on public.user_vehicles (user_id) where is_primary;

-- Bewertungen: eine Bewertung pro Nutzer und Modell (aktualisierbar)
create table public.vehicle_ratings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  model_id int not null references public.vehicle_models (id),
  range_real smallint not null check (range_real between 1 and 5),
  charging_speed smallint not null check (charging_speed between 1 and 5),
  consumption smallint not null check (consumption between 1 and 5),
  software smallint not null check (software between 1 and 5),
  comfort smallint not null check (comfort between 1 and 5),
  build_quality smallint not null check (build_quality between 1 and 5),
  value_for_money smallint not null check (value_for_money between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  is_hidden boolean not null default false,   -- Moderation
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, model_id)
);
create index vehicle_ratings_model_idx on public.vehicle_ratings (model_id);

-- Nur wer das Modell in seiner Garage hat, darf es bewerten
create or replace function public.enforce_rating_rules()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.user_vehicles
    where user_id = new.user_id and model_id = new.model_id
  ) then
    raise exception 'VEHICLE_NOT_OWNED' using errcode = 'P0001';
  end if;
  if tg_op = 'UPDATE' and old.is_hidden and not new.is_hidden and not public.is_admin() then
    new.is_hidden := true;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger vehicle_ratings_rules
before insert or update on public.vehicle_ratings
for each row execute function public.enforce_rating_rules();

-- Aggregierte Bewertungen (öffentlich lesbar, keine Personendaten)
create view public.vehicle_model_scores
with (security_barrier = true)
as
select
  m.id as model_id,
  m.make, m.model, m.variant, m.body_type,
  m.battery_kwh_net, m.dc_max_kw, m.wltp_range_km,
  count(r.id)::int as rating_count,
  round(avg(r.range_real), 2) as range_real,
  round(avg(r.charging_speed), 2) as charging_speed,
  round(avg(r.consumption), 2) as consumption,
  round(avg(r.software), 2) as software,
  round(avg(r.comfort), 2) as comfort,
  round(avg(r.build_quality), 2) as build_quality,
  round(avg(r.value_for_money), 2) as value_for_money,
  round(avg((r.range_real + r.charging_speed + r.consumption + r.software
            + r.comfort + r.build_quality + r.value_for_money) / 7.0), 2) as overall
from public.vehicle_models m
left join public.vehicle_ratings r on r.model_id = m.id and not r.is_hidden
where m.is_active
group by m.id;

-- ---------------------------------------------------------------------
-- Ladestationen (Import aus BNetzA-Ladesäulenregister + Open Charge Map)
-- ---------------------------------------------------------------------
create table public.charging_stations (
  id bigint generated always as identity primary key,
  source text not null check (source in ('bnetza', 'ocm', 'manual')),
  source_id text not null,
  name text not null,
  operator text,
  street text,
  postcode text,
  city text,
  location extensions.geography(point, 4326) not null,
  max_power_kw numeric(6,1) not null,
  num_points smallint,
  is_highway boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);
create index charging_stations_location_idx on public.charging_stations using gist (location);

-- ---------------------------------------------------------------------
-- Ladevorgänge (Check-ins)
-- ---------------------------------------------------------------------
create table public.charging_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  station_id bigint not null references public.charging_stations (id),
  vehicle_id uuid references public.user_vehicles (id) on delete set null,
  vehicle_model_id int references public.vehicle_models (id), -- Snapshot für Statistik
  started_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 minutes',
  ended_at timestamptz,
  end_reason text check (end_reason in ('checkout', 'timeout', 'moved_away', 'new_checkin', 'admin'))
);
create index charging_sessions_active_idx on public.charging_sessions (station_id) where ended_at is null;
create index charging_sessions_user_idx on public.charging_sessions (user_id, started_at desc);

-- ---------------------------------------------------------------------
-- Swipes, Matches, Nachrichten
-- ---------------------------------------------------------------------
create table public.swipes (
  swiper_id uuid not null references auth.users (id) on delete cascade,
  target_id uuid not null references auth.users (id) on delete cascade,
  direction public.swipe_direction not null,
  mode public.app_mode not null,
  station_id bigint references public.charging_stations (id),
  created_at timestamptz not null default now(),
  primary key (swiper_id, target_id, mode),
  check (swiper_id <> target_id)
);
create index swipes_target_idx on public.swipes (target_id, swiper_id) where direction = 'like';

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  mode public.app_mode not null,
  station_id bigint references public.charging_stations (id),
  created_at timestamptz not null default now(),
  unmatched_at timestamptz,
  check (user_a < user_b),
  unique (user_a, user_b)
);
create index matches_user_b_idx on public.matches (user_b);

create table public.messages (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches (id) on delete cascade,
  sender_id uuid not null references auth.users (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index messages_match_idx on public.messages (match_id, created_at);

-- ---------------------------------------------------------------------
-- Blockieren & Melden
-- ---------------------------------------------------------------------
create table public.blocks (
  blocker_id uuid not null references auth.users (id) on delete cascade,
  blocked_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_idx on public.blocks (blocked_id);

create table public.reports (
  id bigint generated always as identity primary key,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reported_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('fake', 'inappropriate_photo', 'harassment', 'spam', 'underage', 'safety', 'other')),
  details text check (char_length(details) <= 1000),
  message_id bigint references public.messages (id) on delete set null,
  status public.report_status not null default 'open',
  admin_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (reporter_id <> reported_id)
);
create index reports_status_idx on public.reports (status, created_at);

create or replace function public.is_blocked_between(a uuid, b uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function public.is_match_member(p_match uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.matches
    where id = p_match
      and unmatched_at is null
      and auth.uid() in (user_a, user_b)
      and not public.is_blocked_between(user_a, user_b)
  );
$$;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.admins enable row level security;
alter table public.profiles enable row level security;
alter table public.consents enable row level security;
alter table public.vehicle_models enable row level security;
alter table public.user_vehicles enable row level security;
alter table public.vehicle_ratings enable row level security;
alter table public.charging_stations enable row level security;
alter table public.charging_sessions enable row level security;
alter table public.swipes enable row level security;
alter table public.matches enable row level security;
alter table public.messages enable row level security;
alter table public.blocks enable row level security;
alter table public.reports enable row level security;

-- admins: nur Admins sehen die Liste
create policy admins_select on public.admins for select to authenticated using (public.is_admin());

-- profiles: nur das eigene Profil direkt; fremde Profile nur per RPC
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_insert_own on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- consents: nur eigene, nur anhängen
create policy consents_select_own on public.consents for select to authenticated using (user_id = auth.uid());
create policy consents_insert_own on public.consents for insert to authenticated with check (user_id = auth.uid());

-- vehicle_models: lesbar für alle (auch anonym, z. B. für eine SEO-Webseite)
create policy vehicle_models_read on public.vehicle_models for select to anon, authenticated using (true);
create policy vehicle_models_admin on public.vehicle_models for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- user_vehicles: eigene
create policy user_vehicles_own on public.user_vehicles for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- vehicle_ratings: eigene schreiben; lesen nur eigene (öffentliche Darstellung über View/RPC)
create policy vehicle_ratings_own on public.vehicle_ratings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy vehicle_ratings_admin on public.vehicle_ratings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- charging_stations: lesbar für angemeldete Nutzer
create policy charging_stations_read on public.charging_stations for select to authenticated using (true);

-- charging_sessions: nur eigene lesen; Schreiben nur über RPC
create policy charging_sessions_own on public.charging_sessions for select to authenticated using (user_id = auth.uid());

-- swipes: nur eigene lesen; Schreiben nur über RPC
create policy swipes_own on public.swipes for select to authenticated using (swiper_id = auth.uid());

-- matches: Teilnehmer
create policy matches_member on public.matches for select to authenticated
  using (auth.uid() in (user_a, user_b));

-- messages: Teilnehmer eines aktiven Matches
create policy messages_select on public.messages for select to authenticated
  using (public.is_match_member(match_id));
create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_match_member(match_id));
create policy messages_mark_read on public.messages for update to authenticated
  using (public.is_match_member(match_id) and sender_id <> auth.uid())
  with check (public.is_match_member(match_id) and sender_id <> auth.uid());

-- Beim "Gelesen"-Markieren darf sich nur read_at ändern
create or replace function public.messages_guard_update()
returns trigger language plpgsql as $$
begin
  if new.body <> old.body or new.sender_id <> old.sender_id or new.match_id <> old.match_id
     or new.created_at <> old.created_at then
    raise exception 'ONLY_READ_AT_UPDATABLE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger messages_guard before update on public.messages
for each row execute function public.messages_guard_update();

-- blocks: eigene
create policy blocks_own on public.blocks for select to authenticated using (blocker_id = auth.uid());

-- reports: eigene lesen, Admins alles
create policy reports_select on public.reports for select to authenticated
  using (reporter_id = auth.uid() or public.is_admin());
create policy reports_admin_update on public.reports for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Tabellenrechte (Supabase vergibt per Default sehr großzügig – wir schränken ein)
revoke all on public.charging_sessions, public.swipes, public.matches, public.blocks, public.reports
  from anon, authenticated;
grant select on public.charging_sessions, public.swipes, public.matches, public.blocks, public.reports
  to authenticated;
grant update (status, admin_note, reviewed_at) on public.reports to authenticated;
revoke all on public.messages from anon;
grant select, insert on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;
revoke all on public.profiles, public.consents, public.user_vehicles, public.vehicle_ratings,
  public.admins, public.charging_stations from anon;
grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.consents to authenticated;
grant select, insert, update, delete on public.user_vehicles, public.vehicle_ratings to authenticated;
grant select on public.admins, public.charging_stations to authenticated;
grant select on public.vehicle_models, public.vehicle_model_scores to anon, authenticated;
grant insert, update, delete on public.vehicle_models to authenticated; -- RLS: nur Admins
