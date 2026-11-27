-- =====================================================================
-- Charge Duett – RPC-Funktionen (Geschäftslogik serverseitig)
-- =====================================================================
-- Datenschutz by Design:
--  * GPS-Koordinaten des Nutzers werden NICHT gespeichert. Sie werden nur
--    beim Check-in/Heartbeat übergeben, um die nächste Station zu finden
--    bzw. das Wegfahren zu erkennen.
--  * Andere Nutzer sehen nie eine Station oder Koordinate einer Person,
--    die an einer ANDEREN Station lädt – nur eine Entfernungsstufe.
-- =====================================================================

-- Konfiguration an einer Stelle
create or replace function public.cfg(key text)
returns numeric language sql immutable as $$
  select case key
    when 'checkin_radius_m'   then 250     -- max. Abstand Handy ↔ Station beim Check-in
    when 'moved_away_m'       then 500     -- ab hier gilt der Ladevorgang als beendet
    when 'min_station_kw'     then 50      -- nur Schnelllader
    when 'discovery_radius_m' then 50000   -- 50 km
    when 'session_minutes'    then 60
    when 'extend_minutes'     then 30
    when 'max_session_minutes' then 180
  end;
$$;

-- Aktive Session des Aufrufers (intern)
create or replace function public._active_session(p_user uuid)
returns public.charging_sessions
language sql stable security definer
set search_path = public
as $$
  select * from public.charging_sessions
  where user_id = p_user and ended_at is null and expires_at > now()
  order by started_at desc
  limit 1;
$$;

create or replace function public._require_profile()
returns public.profiles
language plpgsql stable security definer
set search_path = public
as $$
declare
  p public.profiles;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  select * into p from public.profiles where id = auth.uid();
  if not found then
    raise exception 'PROFILE_MISSING' using errcode = 'P0001';
  end if;
  if p.is_banned then
    raise exception 'BANNED' using errcode = 'P0001';
  end if;
  return p;
end;
$$;

-- ---------------------------------------------------------------------
-- Stationen in der Nähe (nur Anzahl ladender Nutzer, keine Identitäten)
-- ---------------------------------------------------------------------
create or replace function public.nearby_stations(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 25
)
returns table (
  id bigint,
  name text,
  operator text,
  street text,
  city text,
  max_power_kw numeric,
  num_points smallint,
  is_highway boolean,
  lat double precision,
  lng double precision,
  distance_m int,
  active_users int
)
language sql stable security definer
set search_path = public, extensions
as $$
  with me as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as g
  )
  select
    s.id, s.name, s.operator, s.street, s.city, s.max_power_kw, s.num_points, s.is_highway,
    extensions.st_y(s.location::extensions.geometry), extensions.st_x(s.location::extensions.geometry),
    extensions.st_distance(s.location, me.g)::int,
    (
      select count(*)::int
      from public.charging_sessions cs
      join public.profiles p on p.id = cs.user_id and not p.is_banned
      where cs.station_id = s.id and cs.ended_at is null and cs.expires_at > now()
        and not public.is_blocked_between(cs.user_id, auth.uid())
    )
  from public.charging_stations s, me
  where s.max_power_kw >= public.cfg('min_station_kw')
    and extensions.st_dwithin(s.location, me.g, least(greatest(p_radius_km, 1), 100) * 1000)
  order by s.location operator(extensions.<->) me.g
  limit 200;
$$;

-- ---------------------------------------------------------------------
-- Check-in / Check-out / Heartbeat / Verlängern
-- ---------------------------------------------------------------------
create or replace function public.check_in(
  p_lat double precision,
  p_lng double precision,
  p_vehicle_id uuid default null,
  p_station_id bigint default null
)
returns jsonb
language plpgsql volatile security definer
set search_path = public, extensions
as $$
declare
  me public.profiles := public._require_profile();
  pos extensions.geography := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
  st public.charging_stations;
  dist double precision;
  v public.user_vehicles;
  sess public.charging_sessions;
begin
  if not public.has_consent(me.id, 'location') then
    raise exception 'LOCATION_CONSENT_MISSING' using errcode = 'P0001';
  end if;

  -- Station bestimmen: entweder explizit gewählt (muss trotzdem in Reichweite sein) oder die nächste
  select s.* into st
  from public.charging_stations s
  where s.max_power_kw >= public.cfg('min_station_kw')
    and (p_station_id is null or s.id = p_station_id)
    and extensions.st_dwithin(s.location, pos, public.cfg('checkin_radius_m'))
  order by s.location operator(extensions.<->) pos
  limit 1;

  if not found then
    raise exception 'NO_STATION_NEARBY' using errcode = 'P0001';
  end if;
  dist := extensions.st_distance(st.location, pos);

  -- Fahrzeug: übergeben oder Hauptfahrzeug
  if p_vehicle_id is not null then
    select * into v from public.user_vehicles where id = p_vehicle_id and user_id = me.id;
    if not found then
      raise exception 'VEHICLE_NOT_FOUND' using errcode = 'P0001';
    end if;
  else
    select * into v from public.user_vehicles where user_id = me.id order by is_primary desc, created_at limit 1;
  end if;

  -- Laufende Session beenden
  update public.charging_sessions
     set ended_at = now(), end_reason = 'new_checkin'
   where user_id = me.id and ended_at is null;

  insert into public.charging_sessions (user_id, station_id, vehicle_id, vehicle_model_id, expires_at)
  values (me.id, st.id, v.id, v.model_id, now() + make_interval(mins => public.cfg('session_minutes')::int))
  returning * into sess;

  return jsonb_build_object(
    'session_id', sess.id,
    'station_id', st.id,
    'station_name', st.name,
    'station_city', st.city,
    'distance_m', round(dist),
    'started_at', sess.started_at,
    'expires_at', sess.expires_at
  );
end;
$$;

create or replace function public.check_out()
returns void
language sql volatile security definer
set search_path = public
as $$
  update public.charging_sessions
     set ended_at = now(), end_reason = 'checkout'
   where user_id = auth.uid() and ended_at is null;
$$;

create or replace function public.extend_session()
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  sess public.charging_sessions := public._active_session(auth.uid());
begin
  if sess.id is null then
    raise exception 'NO_ACTIVE_SESSION' using errcode = 'P0001';
  end if;
  update public.charging_sessions
     set expires_at = least(
           now() + make_interval(mins => public.cfg('extend_minutes')::int),
           started_at + make_interval(mins => public.cfg('max_session_minutes')::int))
   where id = sess.id
  returning * into sess;
  return jsonb_build_object('session_id', sess.id, 'expires_at', sess.expires_at);
end;
$$;

-- Wird von der App alle paar Minuten im Vordergrund aufgerufen.
create or replace function public.session_heartbeat(p_lat double precision, p_lng double precision)
returns jsonb
language plpgsql volatile security definer
set search_path = public, extensions
as $$
declare
  sess public.charging_sessions := public._active_session(auth.uid());
  st public.charging_stations;
  pos extensions.geography := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography;
begin
  if sess.id is null then
    return jsonb_build_object('active', false);
  end if;
  select * into st from public.charging_stations where id = sess.station_id;
  if not extensions.st_dwithin(st.location, pos, public.cfg('moved_away_m')) then
    update public.charging_sessions set ended_at = now(), end_reason = 'moved_away' where id = sess.id;
    return jsonb_build_object('active', false, 'reason', 'moved_away');
  end if;
  return jsonb_build_object('active', true, 'expires_at', sess.expires_at);
end;
$$;

create or replace function public.my_active_session()
returns jsonb
language sql stable security definer
set search_path = public, extensions
as $$
  select case when s.id is null then null else jsonb_build_object(
    'session_id', s.id,
    'station_id', st.id,
    'station_name', st.name,
    'station_city', st.city,
    'vehicle_id', s.vehicle_id,
    'started_at', s.started_at,
    'expires_at', s.expires_at,
    'people_here', (
      select count(*) from public.charging_sessions o
      join public.profiles p on p.id = o.user_id and not p.is_banned
      where o.station_id = s.station_id and o.ended_at is null and o.expires_at > now()
        and o.user_id <> s.user_id and not public.is_blocked_between(o.user_id, s.user_id)
    ),
    'people_nearby', (
      select count(*) from public.charging_sessions o
      join public.charging_stations st2 on st2.id = o.station_id
      join public.profiles p on p.id = o.user_id and not p.is_banned
      where o.ended_at is null and o.expires_at > now() and o.user_id <> s.user_id
        and extensions.st_dwithin(st2.location, st.location, public.cfg('discovery_radius_m'))
        and not public.is_blocked_between(o.user_id, s.user_id)
    )
  ) end
  from (select (public._active_session(auth.uid())).*) s
  left join public.charging_stations st on st.id = s.station_id;
$$;

-- Aufräumen abgelaufener Sessions (per pg_cron, siehe unten)
create or replace function public.expire_sessions()
returns int
language sql volatile security definer
set search_path = public
as $$
  with x as (
    update public.charging_sessions
       set ended_at = expires_at, end_reason = 'timeout'
     where ended_at is null and expires_at <= now()
    returning 1
  )
  select count(*)::int from x;
$$;

-- ---------------------------------------------------------------------
-- Entdecken (Swipe-Stapel)
-- ---------------------------------------------------------------------
-- p_radius_km: 50 (Standard), 250 oder 0 = bundesweit
create or replace function public.discovery_candidates(p_mode public.app_mode, p_limit int default 30, p_radius_km int default 50)
returns table (
  user_id uuid,
  display_name text,
  age int,
  gender public.gender,
  bio text,
  occupation text,
  photos text[],
  modes public.app_mode[],
  vehicle_make text,
  vehicle_model text,
  vehicle_nickname text,
  same_station boolean,
  station_name text,     -- nur gesetzt, wenn gleiche Station
  distance_bucket text   -- 'same_station' | 'lt10' | 'lt25' | 'lt50' | 'lt100' | 'lt250' | 'far'
)
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare
  me public.profiles := public._require_profile();
  my_sess public.charging_sessions := public._active_session(me.id);
  my_station public.charging_stations;
begin
  if my_sess.id is null or not (p_mode = any(me.modes)) then
    return;  -- leer: App zeigt "Erst einchecken" bzw. "Modus aktivieren"
  end if;
  select * into my_station from public.charging_stations where id = my_sess.station_id;

  return query
  with cand as (
    select distinct on (cs.user_id)
      cs.user_id, cs.station_id, cs.vehicle_id, st.name as st_name,
      extensions.st_distance(st.location, my_station.location) as dist
    from public.charging_sessions cs
    join public.charging_stations st on st.id = cs.station_id
    where cs.ended_at is null and cs.expires_at > now()
      and cs.user_id <> me.id
      and (coalesce(p_radius_km, 0) <= 0
           or extensions.st_dwithin(st.location, my_station.location, least(p_radius_km, 1000) * 1000))
    order by cs.user_id, cs.started_at desc
  )
  select
    p.id,
    p.display_name,
    public.age_of(p.birthdate),
    p.gender,
    p.bio,
    p.occupation,
    p.photos,
    p.modes,
    vm.make, vm.model, uv.nickname,
    c.station_id = my_station.id,
    case when c.station_id = my_station.id then c.st_name end,
    case
      when c.station_id = my_station.id then 'same_station'
      when c.dist < 10000 then 'lt10'
      when c.dist < 25000 then 'lt25'
      when c.dist < 50000 then 'lt50'
      when c.dist < 100000 then 'lt100'
      when c.dist < 250000 then 'lt250'
      else 'far'
    end
  from cand c
  join public.profiles p on p.id = c.user_id
  left join lateral (
    select * from public.user_vehicles u
    where u.user_id = p.id
    order by (u.id = c.vehicle_id) desc, u.is_primary desc, u.created_at
    limit 1
  ) uv on true
  left join public.vehicle_models vm on vm.id = uv.model_id
  where not p.is_banned
    and p_mode = any(p.modes)
    and cardinality(p.photos) >= 1
    and not public.is_blocked_between(me.id, p.id)
    and not exists (select 1 from public.swipes s where s.swiper_id = me.id and s.target_id = p.id and s.mode = p_mode)
    and not exists (select 1 from public.matches m where m.user_a = least(me.id, p.id) and m.user_b = greatest(me.id, p.id))
    and (
      p_mode <> 'dating' or (
        p.gender = any(me.dating_genders)
        and me.gender = any(p.dating_genders)
        and public.age_of(p.birthdate) between me.age_min and me.age_max
        and public.age_of(me.birthdate) between p.age_min and p.age_max
      )
    )
  order by (c.station_id = my_station.id) desc, c.dist, random()
  limit least(greatest(p_limit, 1), 50);
end;
$$;

-- ---------------------------------------------------------------------
-- Swipen
-- ---------------------------------------------------------------------
create or replace function public.swipe(
  p_target uuid,
  p_direction public.swipe_direction,
  p_mode public.app_mode
)
returns jsonb
language plpgsql volatile security definer
set search_path = public, extensions
as $$
declare
  me public.profiles := public._require_profile();
  my_sess public.charging_sessions := public._active_session(me.id);
  t_sess public.charging_sessions;
  t public.profiles;
  near boolean;
  m public.matches;
begin
  if my_sess.id is null then
    raise exception 'NO_ACTIVE_SESSION' using errcode = 'P0001';
  end if;
  select * into t from public.profiles where id = p_target;
  if not found or t.is_banned or not (p_mode = any(t.modes)) or not (p_mode = any(me.modes))
     or public.is_blocked_between(me.id, p_target) then
    raise exception 'TARGET_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  -- Ziel muss (noch) laden – oder ein Like an mich ist schon da
  t_sess := public._active_session(p_target);
  near := t_sess.id is not null;  -- Umkreis wählt der Nutzer beim Entdecken (50 km / 250 km / bundesweit)
  if not near and not exists (
    select 1 from public.swipes where swiper_id = p_target and target_id = me.id and mode = p_mode and direction = 'like'
  ) then
    raise exception 'TARGET_NOT_AVAILABLE' using errcode = 'P0001';
  end if;

  insert into public.swipes (swiper_id, target_id, direction, mode, station_id)
  values (me.id, p_target, p_direction, p_mode, my_sess.station_id)
  on conflict (swiper_id, target_id, mode) do update set direction = excluded.direction, created_at = now();

  if p_direction = 'like' and exists (
    select 1 from public.swipes
    where swiper_id = p_target and target_id = me.id and mode = p_mode and direction = 'like'
  ) then
    insert into public.matches (user_a, user_b, mode, station_id)
    values (least(me.id, p_target), greatest(me.id, p_target), p_mode, my_sess.station_id)
    on conflict (user_a, user_b) do nothing
    returning * into m;
    if m.id is not null then
      return jsonb_build_object('matched', true, 'match_id', m.id);
    end if;
  end if;
  return jsonb_build_object('matched', false);
end;
$$;

-- ---------------------------------------------------------------------
-- Matches & Chat
-- ---------------------------------------------------------------------
create or replace function public.my_matches()
returns table (
  match_id uuid,
  mode public.app_mode,
  created_at timestamptz,
  partner_id uuid,
  partner_name text,
  partner_age int,
  partner_photo text,
  last_message text,
  last_message_at timestamptz,
  last_message_mine boolean,
  unread int
)
language sql stable security definer
set search_path = public
as $$
  select
    m.id, m.mode, m.created_at,
    p.id, p.display_name, public.age_of(p.birthdate), p.photos[1],
    lm.body, lm.created_at, lm.sender_id = auth.uid(),
    (select count(*)::int from public.messages x
      where x.match_id = m.id and x.sender_id <> auth.uid() and x.read_at is null)
  from public.matches m
  join public.profiles p on p.id = case when m.user_a = auth.uid() then m.user_b else m.user_a end
  left join lateral (
    select body, created_at, sender_id from public.messages
    where match_id = m.id order by created_at desc limit 1
  ) lm on true
  where auth.uid() in (m.user_a, m.user_b)
    and m.unmatched_at is null
    and not p.is_banned
    and not public.is_blocked_between(m.user_a, m.user_b)
  order by coalesce(lm.created_at, m.created_at) desc;
$$;

create or replace function public.match_partner(p_match uuid)
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'user_id', p.id,
    'display_name', p.display_name,
    'age', public.age_of(p.birthdate),
    'gender', p.gender,
    'bio', p.bio,
    'occupation', p.occupation,
    'photos', p.photos,
    'modes', p.modes,
    'mode', m.mode,
    'vehicles', coalesce((
      select jsonb_agg(jsonb_build_object(
        'make', vm.make, 'model', vm.model, 'variant', vm.variant,
        'nickname', uv.nickname, 'description', uv.description, 'model_year', uv.model_year
      ) order by uv.is_primary desc)
      from public.user_vehicles uv join public.vehicle_models vm on vm.id = uv.model_id
      where uv.user_id = p.id
    ), '[]'::jsonb)
  )
  from public.matches m
  join public.profiles p on p.id = case when m.user_a = auth.uid() then m.user_b else m.user_a end
  where m.id = p_match and public.is_match_member(m.id);
$$;

create or replace function public.unmatch(p_match uuid)
returns void
language sql volatile security definer
set search_path = public
as $$
  update public.matches set unmatched_at = now()
  where id = p_match and auth.uid() in (user_a, user_b) and unmatched_at is null;
$$;

create or replace function public.mark_read(p_match uuid)
returns void
language sql volatile security definer
set search_path = public
as $$
  update public.messages set read_at = now()
  where match_id = p_match and sender_id <> auth.uid() and read_at is null
    and public.is_match_member(p_match);
$$;

-- ---------------------------------------------------------------------
-- Blockieren & Melden
-- ---------------------------------------------------------------------
create or replace function public.block_user(p_target uuid)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_target = auth.uid() then
    raise exception 'INVALID_TARGET' using errcode = 'P0001';
  end if;
  insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), p_target)
  on conflict do nothing;
  update public.matches set unmatched_at = coalesce(unmatched_at, now())
  where user_a = least(auth.uid(), p_target) and user_b = greatest(auth.uid(), p_target);
end;
$$;

create or replace function public.report_user(
  p_target uuid,
  p_reason text,
  p_details text default null,
  p_message_id bigint default null
)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
begin
  if auth.uid() is null or p_target = auth.uid() then
    raise exception 'INVALID_TARGET' using errcode = 'P0001';
  end if;
  -- Nachricht muss aus einem gemeinsamen Chat stammen
  if p_message_id is not null and not exists (
    select 1 from public.messages msg join public.matches m on m.id = msg.match_id
    where msg.id = p_message_id and msg.sender_id = p_target and auth.uid() in (m.user_a, m.user_b)
  ) then
    p_message_id := null;
  end if;
  insert into public.reports (reporter_id, reported_id, reason, details, message_id)
  values (auth.uid(), p_target, p_reason, p_details, p_message_id);
  perform public.block_user(p_target);
end;
$$;

-- ---------------------------------------------------------------------
-- Fahrzeug-Bewertungen (öffentliche Kommentare ohne Klarnamen)
-- ---------------------------------------------------------------------
create or replace function public.model_reviews(p_model int, p_limit int default 20, p_offset int default 0)
returns table (
  id uuid,
  author text,
  overall numeric,
  range_real smallint, charging_speed smallint, consumption smallint, software smallint,
  comfort smallint, build_quality smallint, value_for_money smallint,
  comment text,
  updated_at timestamptz
)
language sql stable security definer
set search_path = public
as $$
  select r.id,
    left(p.display_name, 1) || '.',   -- nur Initiale
    round((r.range_real + r.charging_speed + r.consumption + r.software + r.comfort
           + r.build_quality + r.value_for_money) / 7.0, 1),
    r.range_real, r.charging_speed, r.consumption, r.software, r.comfort, r.build_quality, r.value_for_money,
    r.comment, r.updated_at
  from public.vehicle_ratings r
  join public.profiles p on p.id = r.user_id and not p.is_banned
  where r.model_id = p_model and not r.is_hidden
  order by (r.comment is not null) desc, r.updated_at desc
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
$$;

-- ---------------------------------------------------------------------
-- DSGVO: Auskunft (Art. 15/20) und Löschung (Art. 17)
-- ---------------------------------------------------------------------
create or replace function public.export_my_data()
returns jsonb
language sql stable security definer
set search_path = public
as $$
  select jsonb_build_object(
    'exported_at', now(),
    'profile', (select to_jsonb(p) from public.profiles p where id = auth.uid()),
    'consents', (select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at), '[]') from public.consents c where user_id = auth.uid()),
    'vehicles', (select coalesce(jsonb_agg(to_jsonb(v)), '[]') from public.user_vehicles v where user_id = auth.uid()),
    'ratings', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.vehicle_ratings r where user_id = auth.uid()),
    'charging_sessions', (select coalesce(jsonb_agg(to_jsonb(s) order by s.started_at), '[]') from public.charging_sessions s where user_id = auth.uid()),
    'swipes', (select coalesce(jsonb_agg(to_jsonb(s)), '[]') from public.swipes s where swiper_id = auth.uid()),
    'matches', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.matches m where auth.uid() in (user_a, user_b)),
    'messages_sent', (select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at), '[]') from public.messages x where sender_id = auth.uid()),
    'blocks', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from public.blocks b where blocker_id = auth.uid()),
    'reports_filed', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from public.reports r where reporter_id = auth.uid())
  );
$$;

-- Löscht den Auth-User; alle Daten hängen per ON DELETE CASCADE daran.
-- Fotos im Storage löscht die App vorher (siehe lib/account.ts).
create or replace function public.delete_my_account()
returns void
language plpgsql volatile security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------
-- Moderation (nur Admins)
-- ---------------------------------------------------------------------
create or replace function public.admin_open_reports()
returns table (
  report_id bigint, created_at timestamptz, reason text, details text,
  reporter_id uuid, reported_id uuid, reported_name text, reported_photos text[], reported_bio text,
  reported_is_banned boolean, message_body text, reports_against_user int
)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  return query
  select r.id, r.created_at, r.reason, r.details, r.reporter_id, r.reported_id,
         p.display_name, p.photos, p.bio, p.is_banned, msg.body,
         (select count(*)::int from public.reports r2 where r2.reported_id = r.reported_id)
  from public.reports r
  left join public.profiles p on p.id = r.reported_id
  left join public.messages msg on msg.id = r.message_id
  where r.status = 'open'
  order by r.created_at;
end;
$$;

create or replace function public.admin_resolve_report(
  p_report bigint,
  p_status public.report_status,
  p_ban boolean default false,
  p_note text default null
)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
declare
  target uuid;
begin
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  update public.reports set status = p_status, admin_note = p_note, reviewed_at = now()
  where id = p_report returning reported_id into target;
  if p_ban and target is not null then
    update public.profiles set is_banned = true where id = target;
    update public.charging_sessions set ended_at = now(), end_reason = 'admin'
    where user_id = target and ended_at is null;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Rechte auf Funktionen: interne Helfer nicht von außen aufrufbar
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.nearby_stations(double precision, double precision, double precision),
  public.check_in(double precision, double precision, uuid, bigint),
  public.check_out(),
  public.extend_session(),
  public.session_heartbeat(double precision, double precision),
  public.my_active_session(),
  public.discovery_candidates(public.app_mode, int, int),
  public.swipe(uuid, public.swipe_direction, public.app_mode),
  public.my_matches(),
  public.match_partner(uuid),
  public.unmatch(uuid),
  public.mark_read(uuid),
  public.block_user(uuid),
  public.report_user(uuid, text, text, bigint),
  public.model_reviews(int, int, int),
  public.export_my_data(),
  public.delete_my_account(),
  public.admin_open_reports(),
  public.admin_resolve_report(bigint, public.report_status, boolean, text),
  public.is_admin(),
  -- werden in RLS-Policies/Triggern benutzt und müssen daher ausführbar sein:
  public.is_match_member(uuid),
  public.is_blocked_between(uuid, uuid),
  public.has_consent(uuid, public.consent_type),
  public.age_of(date),
  public.cfg(text),
  public.enforce_profile_rules(),
  public.enforce_rating_rules(),
  public.messages_guard_update()
to authenticated;
grant execute on function public.model_reviews(int, int, int), public.age_of(date) to anon;
revoke execute on function public.expire_sessions(), public._active_session(uuid), public._require_profile()
  from authenticated;
-- _active_session/_require_profile werden nur innerhalb von SECURITY-DEFINER-Funktionen aufgerufen

-- ---------------------------------------------------------------------
-- Realtime für Chat & Matches
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages, public.matches;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Cron: abgelaufene Sessions jede Minute schließen (pg_cron in Supabase aktivieren)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('chargeduett-expire-sessions', '* * * * *', 'select public.expire_sessions()');
  end if;
exception when others then
  raise notice 'pg_cron nicht verfügbar – expire_sessions() bitte anders einplanen: %', sqlerrm;
end $$;
