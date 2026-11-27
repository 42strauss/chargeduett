-- End-to-End-Szenario gegen die Migrationen (lokal, mit 00_supabase_stub.sql)
\set ON_ERROR_STOP 1
insert into public.charging_stations (source, source_id, name, city, location, max_power_kw, is_highway) values
 ('manual','A','Rastanlage Testfeld Ost','Testfeld', 'SRID=4326;POINT(8.5000 50.0000)', 300, true),
 ('manual','B','Supercharger Nachbarort','Nachbarort', 'SRID=4326;POINT(8.5700 50.0000)', 250, false),
 ('manual','C','HPC Weit weg','Fernstadt', 'SRID=4326;POINT(10.0000 50.0000)', 150, true),
 ('manual','D','AC-Säule nebenan','Testfeld', 'SRID=4326;POINT(8.5005 50.0000)', 22, false);

insert into auth.users values
 ('00000000-0000-0000-0000-00000000000a','anna@test'),
 ('00000000-0000-0000-0000-00000000000b','ben@test'),
 ('00000000-0000-0000-0000-00000000000c','carl@test'),
 ('00000000-0000-0000-0000-00000000000d','dora@test'),
 ('00000000-0000-0000-0000-00000000000e','emil@test');
insert into public.admins values ('00000000-0000-0000-0000-00000000000e');

create or replace function pg_temp.as_user(u text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', u, false);
  execute 'set role authenticated';
end $$;
create or replace function pg_temp.expect_error(sql text, code text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'ERWARTETER FEHLER % BLIEB AUS: %', code, sql;
exception when others then
  if sqlerrm <> code then raise exception 'Falscher Fehler für %: % (erwartet %)', sql, sqlerrm, code; end if;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

-- ---------- Anna
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into profiles (id, display_name, birthdate, gender, modes, dating_genders, photos)
values (auth.uid(), 'Anna', '1992-05-01', 'female', '{friendship,dating}', '{male}', '{a/1.jpg}');
insert into consents (user_id, type, granted, version) values (auth.uid(), 'location', true, 'v1'), (auth.uid(), 'data_sharing', true, 'v1');
insert into user_vehicles (user_id, model_id, nickname, is_primary)
  select auth.uid(), id, 'Blitz', true from vehicle_models where make='Hyundai' and model='Ioniq 5';
-- Check-in an AC-Säule geht nicht -> nimmt Schnelllader A (40 m entfernt)
select (check_in(50.0, 8.5004)) ->> 'station_name' as anna_station;
-- Bewertung des eigenen Modells ok, fremdes Modell nicht
insert into vehicle_ratings (user_id, model_id, range_real, charging_speed, consumption, software, comfort, build_quality, value_for_money, comment)
  select auth.uid(), id, 4,5,4,3,4,4,4,'Lädt rasend schnell' from vehicle_models where make='Hyundai' and model='Ioniq 5';
select pg_temp.expect_error($q$insert into vehicle_ratings (user_id, model_id, range_real, charging_speed, consumption, software, comfort, build_quality, value_for_money)
  select auth.uid(), id, 1,1,1,1,1,1,1 from vehicle_models where make='Tesla' limit 1$q$, 'VEHICLE_NOT_OWNED');
-- Keine fremden Sessions direkt lesbar, kein direktes Insert
select pg_temp.expect_error($q$insert into charging_sessions(user_id, station_id) values (auth.uid(), 1)$q$, 'permission denied for table charging_sessions');

-- Push: Anna aktiviert "Jemand Neues lädt hier" und Nachrichtenvorschau, registriert Gerät
select (my_notification_settings()).matches as anna_match_push_default;
update notification_settings set station_activity = true, message_preview = true where user_id = auth.uid();
select register_push_token('ExponentPushToken[anna-test]', 'ios');
select pg_temp.expect_error($q$select register_push_token('kein-token', 'ios')$q$, 'INVALID_TOKEN');

-- ---------- Dora (17) darf nicht
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.expect_error($q$insert into profiles (id, display_name, birthdate, gender) values (auth.uid(), 'Dora', (current_date - interval '17 years')::date, 'female')$q$, 'UNDERAGE');

-- ---------- Ben, ohne Standort-Einwilligung -> Fehler; dann 5 km entfernt an B
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into profiles (id, display_name, birthdate, gender, modes, dating_genders, photos)
values (auth.uid(), 'Ben', '1990-01-01', 'male', '{friendship,networking,dating}', '{female}', '{b/1.jpg}');
select pg_temp.expect_error('select check_in(50.0, 8.57)', 'LOCATION_CONSENT_MISSING');
insert into consents (user_id, type, granted, version) values (auth.uid(), 'location', true, 'v1');
select pg_temp.expect_error('select check_in(50.1, 8.57)', 'NO_STATION_NEARBY');
select (check_in(50.0, 8.5701)) ->> 'station_name' as ben_station;
select display_name, distance_bucket, station_name is null as station_hidden, vehicle_model from discovery_candidates('dating');
select count(*) as ben_networking_candidates from discovery_candidates('networking'); -- Anna hat networking nicht
select swipe('00000000-0000-0000-0000-00000000000a', 'like', 'dating') as ben_swipe;

-- ---------- Carl weit weg sieht niemanden, kann Anna nicht swipen
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
insert into profiles (id, display_name, birthdate, gender, modes, photos) values (auth.uid(), 'Carl', '1985-01-01', 'male', '{friendship}', '{c/1.jpg}');
insert into consents (user_id, type, granted, version) values (auth.uid(), 'location', true, 'v1');
select (check_in(50.0, 10.0)) ->> 'station_name';
select count(*) as carl_candidates_50km from discovery_candidates('friendship');
select display_name, distance_bucket from discovery_candidates('friendship', 30, 0); -- bundesweit: Anna, 'lt250'

-- ---------- Anna sieht Ben, liked -> Match
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select display_name, age, distance_bucket from discovery_candidates('dating');
select count(*) as anna_friend_candidates from discovery_candidates('friendship');
select swipe('00000000-0000-0000-0000-00000000000b', 'like', 'dating') ->> 'matched' as anna_matched;
select partner_name, partner_age, mode from my_matches();
insert into messages (match_id, sender_id, body) select match_id, auth.uid(), 'Hi Ben, auch am Laden? ⚡' from my_matches();
select my_active_session() ->> 'people_nearby' as anna_people_nearby;
-- Anna sieht keine fremden Swipes oder Sessions
select count(*) as visible_foreign_sessions from charging_sessions where user_id <> auth.uid();
select count(*) as visible_foreign_profiles from profiles where id <> auth.uid();

-- ---------- Ben liest, Carl darf Chat nicht lesen
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select partner_name, last_message, unread from my_matches();
select mark_read(match_id) from my_matches();
select unread from my_matches();
select match_partner(match_id) -> 'vehicles' -> 0 ->> 'nickname' as annas_car from my_matches();
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select count(*) as carl_sees_messages from messages;

-- ---------- Heartbeat: Ben fährt weg
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select session_heartbeat(50.0, 8.5701) ->> 'active' as still_active;
select session_heartbeat(50.05, 8.65) ->> 'reason' as reason;
select my_active_session() is null as ben_no_session;
-- Ben meldet Anna (Test) -> Block + Unmatch
select report_user('00000000-0000-0000-0000-00000000000a', 'spam', 'Testmeldung');
select count(*) as ben_matches_after_report from my_matches();

-- ---------- Admin
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000e');
select reason, reported_name, reports_against_user from admin_open_reports();
select admin_resolve_report((select report_id from admin_open_reports() limit 1), 'dismissed', false, 'Test');
select count(*) as open_after from admin_open_reports();
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.expect_error('select admin_open_reports()', 'FORBIDDEN');

-- ---------- Öffentliche Bewertungen / Export / Löschen
select make, model, rating_count, overall from vehicle_model_scores where rating_count > 0;
select author, overall, comment from model_reviews((select id from vehicle_models where model='Ioniq 5'));
select jsonb_array_length(export_my_data() -> 'charging_sessions') as exported_sessions;
reset role;
set role anon;
select count(*) as anon_models from vehicle_models;
select pg_temp.expect_error('select count(*) from profiles', 'permission denied for table profiles');
reset role;
-- Fiona checkt an Annas Station ein (2×) → Anna bekommt genau 1 "Jemand Neues lädt hier"
insert into auth.users values ('00000000-0000-0000-0000-0000000000f0','fiona@test');
select pg_temp.as_user('00000000-0000-0000-0000-0000000000f0');
insert into profiles (id, display_name, birthdate, gender, modes, photos) values (auth.uid(), 'Fiona', '1991-01-01', 'female', '{friendship}', '{f/1.jpg}');
insert into consents (user_id, type, granted, version) values (auth.uid(), 'location', true, 'v1');
select check_in(50.0, 8.5001) ->> 'station_name' as fiona_1;
select check_in(50.0, 8.5001) ->> 'station_name' as fiona_2;
reset role;
-- Push-Protokoll prüfen (ohne pg_net nur Outbox)
select u.email, o.kind, o.title, o.body, o.tokens from push_outbox o join auth.users u on u.id = o.user_id order by o.id;
-- Timeout-Job
update charging_sessions set expires_at = now() - interval '1 minute' where ended_at is null;
select expire_sessions() as expired;
-- Analytics: Anna hat Einwilligung, aber k<5 -> leer
select count(*) as analytics_rows from analytics.station_usage_hourly;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select delete_my_account();
reset role;
select (select count(*) from auth.users where email='anna@test') as anna_users,
       (select count(*) from profiles where display_name='Anna') as anna_profiles,
       (select count(*) from vehicle_ratings) as ratings_left;
