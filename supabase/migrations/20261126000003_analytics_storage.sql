-- =====================================================================
-- Charge Duett – Datenprodukte (anonymisiert) & Foto-Storage
-- =====================================================================
-- WICHTIG zum Thema "Daten verkaufen":
-- Personenbezogene Daten (Profil, Standortverlauf, Chat) dürfen ohne
-- ausdrückliche, freiwillige, widerrufbare Einwilligung NICHT an Dritte
-- verkauft werden (DSGVO Art. 6/7). Die App darf außerdem nicht davon
-- abhängig gemacht werden (Kopplungsverbot, Art. 7 Abs. 4).
--
-- Darum: Verkauft werden nur AGGREGIERTE Kennzahlen aus diesem Schema,
--   * nur von Nutzern mit Einwilligung 'data_sharing',
--   * nur Zellen mit >= 5 verschiedenen Personen (k-Anonymität),
--   * ohne Nutzer-IDs, ohne Zeitstempel feiner als Stunde.
-- Der Zugriff erfolgt ausschließlich über die service_role (Backoffice),
-- nie aus der App.
-- =====================================================================

create schema if not exists analytics;
revoke all on schema analytics from public, anon, authenticated;

-- Ladevorgänge pro Station, Wochentag und Stunde, nach Fahrzeugmarke
create or replace view analytics.station_usage_hourly as
select
  st.id as station_id,
  st.name as station_name,
  st.operator,
  st.city,
  st.is_highway,
  extract(isodow from cs.started_at at time zone 'Europe/Berlin')::int as weekday,
  extract(hour from cs.started_at at time zone 'Europe/Berlin')::int as hour,
  vm.make as vehicle_make,
  count(*)::int as sessions,
  count(distinct cs.user_id)::int as distinct_users,
  round(avg(extract(epoch from (coalesce(cs.ended_at, cs.expires_at) - cs.started_at)) / 60)) as avg_minutes
from public.charging_sessions cs
join public.charging_stations st on st.id = cs.station_id
left join public.vehicle_models vm on vm.id = cs.vehicle_model_id
where public.has_consent(cs.user_id, 'data_sharing')
group by 1, 2, 3, 4, 5, 6, 7, 8
having count(distinct cs.user_id) >= 5;

-- Fahrzeugbestand der Nutzer (Marke/Modell, Altersgruppe), k >= 5
create or replace view analytics.vehicle_fleet as
select
  vm.make, vm.model, vm.variant,
  case
    when public.age_of(p.birthdate) < 30 then '18-29'
    when public.age_of(p.birthdate) < 45 then '30-44'
    when public.age_of(p.birthdate) < 60 then '45-59'
    else '60+'
  end as age_group,
  count(distinct uv.user_id)::int as owners
from public.user_vehicles uv
join public.vehicle_models vm on vm.id = uv.model_id
join public.profiles p on p.id = uv.user_id
where public.has_consent(uv.user_id, 'data_sharing')
group by 1, 2, 3, 4
having count(distinct uv.user_id) >= 5;

-- Bewertungs-Kennzahlen pro Modell (Bewertungen sind ohnehin öffentlich aggregiert)
create or replace view analytics.vehicle_scores as
select * from public.vehicle_model_scores where rating_count >= 5;

grant usage on schema analytics to service_role;
grant select on all tables in schema analytics to service_role;

-- ---------------------------------------------------------------------
-- Storage-Bucket für Profilfotos
-- Öffentlich lesbar über nicht erratbare Pfade: <user_id>/<uuid>.jpg
-- (Andernfalls bräuchte jede Swipe-Karte eine signierte URL – für das MVP
--  bewusst vereinfacht; siehe README "Bekannte Grenzen".)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('photos', 'photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
    on conflict (id) do nothing;

    execute $p$
      create policy photos_insert_own on storage.objects for insert to authenticated
      with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
    execute $p$
      create policy photos_update_own on storage.objects for update to authenticated
      using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
    execute $p$
      create policy photos_delete_own on storage.objects for delete to authenticated
      using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)
    $p$;
  end if;
end $$;
