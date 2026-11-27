-- =====================================================================
-- Charge Duett – Push-Benachrichtigungen
-- =====================================================================
-- Arten:
--   match       Neues Match (beide Seiten), sofort
--   message     Neue Nachricht, sofort. Sperrbildschirm zeigt standardmäßig
--               nur "Neue Nachricht von X" – Inhalt nur mit message_preview
--   station     Opt-in: "Jemand Neues lädt an deiner Station",
--               höchstens 1× pro eigenem Ladevorgang
--   (Checkout-Erinnerung 5 Min. vor Ablauf plant die App LOKAL – kein Server.)
-- Keine Marketing-Pushes.
--
-- Versand: Tabelle push_outbox (Protokoll) + sofortiger HTTP-Aufruf an den
-- Expo-Push-Dienst über pg_net (in Supabase: Database → Extensions → pg_net).
-- Ohne pg_net werden die Nachrichten nur in der Outbox protokolliert.
-- =====================================================================

create table public.push_tokens (
  token text primary key,                 -- ExponentPushToken[...]
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now()
);
create index push_tokens_user_idx on public.push_tokens (user_id);

create table public.notification_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  matches boolean not null default true,
  messages boolean not null default true,
  message_preview boolean not null default false,
  station_activity boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.push_outbox (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('match', 'message', 'station')),
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  ref text,                               -- z. B. Session-ID für 1×-pro-Ladevorgang
  tokens int not null default 0,
  sent boolean not null default false,
  created_at timestamptz not null default now()
);
create index push_outbox_user_idx on public.push_outbox (user_id, created_at desc);
create unique index push_outbox_station_once on public.push_outbox (user_id, kind, ref) where kind = 'station';

alter table public.push_tokens enable row level security;
alter table public.notification_settings enable row level security;
alter table public.push_outbox enable row level security;

create policy push_tokens_own on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notification_settings_own on public.notification_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
-- push_outbox: kein Client-Zugriff

revoke all on public.push_tokens, public.notification_settings, public.push_outbox from anon, authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;
grant select, insert, update on public.notification_settings to authenticated;

-- Token registrieren (ein Gerät gehört immer nur einem Konto)
create or replace function public.register_push_token(p_token text, p_platform text)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  if p_token !~ '^Expo(nent)?PushToken\[.+\]$' then
    raise exception 'INVALID_TOKEN' using errcode = 'P0001';
  end if;
  insert into public.push_tokens (token, user_id, platform) values (p_token, auth.uid(), p_platform)
  on conflict (token) do update set user_id = excluded.user_id, platform = excluded.platform, updated_at = now();
end;
$$;

create or replace function public.my_notification_settings()
returns public.notification_settings
language sql volatile security definer
set search_path = public
as $$
  insert into public.notification_settings (user_id) values (auth.uid()) on conflict (user_id) do nothing;
  select * from public.notification_settings where user_id = auth.uid();
$$;

-- Zentrale Versandfunktion
create or replace function public.send_push(
  p_user uuid, p_kind text, p_title text, p_body text, p_data jsonb default '{}', p_ref text default null
)
returns void
language plpgsql volatile security definer
set search_path = public
as $$
declare
  toks text[];
  msgs jsonb;
  v_id bigint;
begin
  select coalesce(array_agg(token), '{}') into toks from public.push_tokens where user_id = p_user;
  insert into public.push_outbox (user_id, kind, title, body, data, ref, tokens)
  values (p_user, p_kind, p_title, p_body, p_data, p_ref, cardinality(toks))
  on conflict do nothing
  returning id into v_id;
  if v_id is null or cardinality(toks) = 0 then
    return;  -- schon gesendet (station 1×) oder kein Gerät registriert
  end if;
  select jsonb_agg(jsonb_build_object(
    'to', t, 'title', p_title, 'body', p_body, 'data', p_data,
    'sound', 'default', 'channelId', 'default', 'priority', 'high'))
  into msgs from unnest(toks) t;
  begin
    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
      body := msgs
    );
    update public.push_outbox set sent = true where id = v_id;
  exception when others then
    -- pg_net nicht aktiv: nur protokollieren, Insert/Chat darf nie daran scheitern
    raise notice 'Push nicht gesendet (%): %', p_kind, sqlerrm;
  end;
end;
$$;

create or replace function public._txt(p_locale text, de text, en text)
returns text language sql immutable as $$ select case when p_locale = 'en' then en else de end $$;

-- Neues Match → beide benachrichtigen
create or replace function public.on_match_push()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  a public.profiles; b public.profiles;
begin
  select * into a from public.profiles where id = new.user_a;
  select * into b from public.profiles where id = new.user_b;
  if coalesce((select matches from public.notification_settings where user_id = a.id), true) then
    perform public.send_push(a.id, 'match', public._txt(a.locale, 'Es hat gefunkt! ⚡', 'Sparks fly! ⚡'),
      public._txt(a.locale, 'Du und ' || b.display_name || ' wollt euch kennenlernen.', 'You and ' || b.display_name || ' want to meet.'),
      jsonb_build_object('type', 'match', 'match_id', new.id));
  end if;
  if coalesce((select matches from public.notification_settings where user_id = b.id), true) then
    perform public.send_push(b.id, 'match', public._txt(b.locale, 'Es hat gefunkt! ⚡', 'Sparks fly! ⚡'),
      public._txt(b.locale, 'Du und ' || a.display_name || ' wollt euch kennenlernen.', 'You and ' || a.display_name || ' want to meet.'),
      jsonb_build_object('type', 'match', 'match_id', new.id));
  end if;
  return new;
end;
$$;
create trigger matches_push after insert on public.matches
for each row execute function public.on_match_push();

-- Neue Nachricht → Empfänger
create or replace function public.on_message_push()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  m public.matches; rcpt public.profiles; sender public.profiles; s public.notification_settings;
begin
  select * into m from public.matches where id = new.match_id;
  select * into rcpt from public.profiles where id = case when m.user_a = new.sender_id then m.user_b else m.user_a end;
  select * into sender from public.profiles where id = new.sender_id;
  select * into s from public.notification_settings where user_id = rcpt.id;
  if rcpt.is_banned or not coalesce(s.messages, true) or public.is_blocked_between(rcpt.id, sender.id) then
    return new;
  end if;
  perform public.send_push(rcpt.id, 'message',
    public._txt(rcpt.locale, 'Neue Nachricht von ', 'New message from ') || sender.display_name,
    case when coalesce(s.message_preview, false) then left(new.body, 120)
         else public._txt(rcpt.locale, 'Tippe zum Lesen.', 'Tap to read.') end,
    jsonb_build_object('type', 'message', 'match_id', new.match_id));
  return new;
end;
$$;
create trigger messages_push after insert on public.messages
for each row execute function public.on_message_push();

-- Jemand checkt ein → Opt-in-Nutzer an derselben Station (max. 1× pro deren Session)
create or replace function public.on_checkin_push()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  newcomer public.profiles; r record; st_name text;
begin
  select * into newcomer from public.profiles where id = new.user_id;
  if newcomer.is_banned or cardinality(newcomer.photos) = 0 then
    return new;
  end if;
  select name into st_name from public.charging_stations where id = new.station_id;
  for r in
    select cs.id as session_id, p.*
    from public.charging_sessions cs
    join public.profiles p on p.id = cs.user_id
    join public.notification_settings ns on ns.user_id = p.id and ns.station_activity
    where cs.station_id = new.station_id and cs.ended_at is null and cs.expires_at > now()
      and cs.user_id <> new.user_id and not p.is_banned
      and p.modes && newcomer.modes
      and not public.is_blocked_between(p.id, newcomer.id)
  loop
    perform public.send_push(r.id, 'station',
      public._txt(r.locale, 'Jemand Neues lädt hier ⚡', 'Someone new is charging here ⚡'),
      public._txt(r.locale, 'An ' || st_name || ' ist gerade jemand angekommen. Schau mal rein!',
                            'Someone just arrived at ' || st_name || '. Take a look!'),
      jsonb_build_object('type', 'station'),
      r.session_id::text);
  end loop;
  return new;
end;
$$;
create trigger charging_sessions_push after insert on public.charging_sessions
for each row execute function public.on_checkin_push();

-- Rechte
revoke execute on function public.send_push(uuid, text, text, text, jsonb, text), public._txt(text, text, text),
  public.on_match_push(), public.on_message_push(), public.on_checkin_push() from public, anon, authenticated;
grant execute on function public.register_push_token(text, text), public.my_notification_settings() to authenticated;

-- Abgemeldete Geräte gelegentlich aufräumen (Tokens, die 90 Tage nicht erneuert wurden)
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('chargeduett-push-token-cleanup', '17 3 * * *',
      $q$delete from public.push_tokens where updated_at < now() - interval '90 days'$q$);
  end if;
exception when others then null;
end $$;
