insert into public.charging_stations (source, source_id, name, operator, city, location, max_power_kw, num_points, is_highway) values
 ('manual','d1','Rastanlage Lindenhain Ost (Demo)','Demo-Laden GmbH','Lindenhain','SRID=4326;POINT(8.6000 50.0500)',400,12,true),
 ('manual','d2','Schnellladepark Birkenfeld (Demo)','Demo-Laden GmbH','Birkenfeld','SRID=4326;POINT(8.6800 50.0700)',300,8,false),
 ('manual','d3','Autohof Eichstetten (Demo)','Beispiel Energie','Eichstetten','SRID=4326;POINT(8.8300 50.1200)',150,4,true),
 ('manual','d4','Supermarkt Ahornplatz (Demo)','Beispiel Energie','Ahornplatz','SRID=4326;POINT(8.9500 50.2300)',50,2,false),
 ('manual','d5','HPC Fichtenau (Demo)','Demo-Laden GmbH','Fichtenau','SRID=4326;POINT(8.6100 50.0580)',350,6,false);

create or replace function pg_temp.mkuser(p_id uuid, p_name text, p_birth date, p_gender gender, p_modes app_mode[], p_dg gender[], p_photo text, p_bio text, p_job text, p_make text, p_model text, p_variant text, p_nick text)
returns void language plpgsql as $$
begin
  insert into auth.users values (p_id, lower(p_name)||'@demo.chargeduett');
  insert into profiles (id, display_name, birthdate, gender, modes, dating_genders, photos, bio, occupation)
  values (p_id, p_name, p_birth, p_gender, p_modes, p_dg, case when p_photo is null then '{}' else array[p_photo] end, p_bio, p_job);
  insert into consents (user_id, type, granted, version) values (p_id,'terms',true,'v1'),(p_id,'location',true,'v1'),(p_id,'data_sharing',true,'v1');
  insert into user_vehicles (user_id, model_id, nickname, is_primary)
  select p_id, id, p_nick, true from vehicle_models where make=p_make and model=p_model and variant=p_variant;
end $$;

select pg_temp.mkuser('00000000-0000-0000-0000-000000000001','Max','1992-03-14','male','{friendship,networking,dating}','{female}','seed/max.png','Fahre jede Woche Frankfurt–Köln. Kaffee an der Säule? Immer.','Produktmanager','Volkswagen','ID.7 Tourer','Pro','Silberpfeil');
select pg_temp.mkuser('00000000-0000-0000-0000-000000000002','Lena','1995-07-02','female','{friendship,dating}','{male}','seed/lena.png','Roadtrips, Hörbücher und die Suche nach dem besten Raststätten-Croissant.','UX-Designerin','Tesla','Model Y','Long Range','Polarstern');
select pg_temp.mkuser('00000000-0000-0000-0000-000000000003','Jonas','1988-11-20','male','{friendship,networking}','{}','seed/jonas.png','Vertrieb Erneuerbare. Immer offen für einen Austausch übers Laden.','Key Account Manager','Kia','EV6','84 kWh','Blauer Blitz');
select pg_temp.mkuser('00000000-0000-0000-0000-000000000004','Sophie','1997-01-09','female','{friendship,dating}','{male}','seed/sophie.png','Hundemensch 🐕 Lädt am liebsten mit Aussicht.','Tierärztin','Hyundai','Ioniq 5','84 kWh','Pixel');
select pg_temp.mkuser('00000000-0000-0000-0000-000000000005','Kemal','1981-05-30','male','{friendship,networking}','{}','seed/kemal.png','Unternehmer, viel unterwegs zwischen Rhein und Main.','Geschäftsführer','BMW','i4','eDrive40','Graphit');
select pg_temp.mkuser('00000000-0000-0000-0000-000000000006','Anja','1974-08-17','female','{friendship,networking}','{}','seed/anja.png','Wandern, Jazz, E-Auto seit 2019.','Ingenieurin','Škoda','Enyaq','85','Waldfee');
select pg_temp.mkuser('00000000-0000-0000-0000-000000000007','Neu','1990-01-01','female','{friendship}','{}',null,null,null,'Andere','Anderes Fahrzeug','','x');
delete from profiles where display_name='Neu';

-- Ladevorgänge (Max checkt in der Demo selbst ein)
insert into charging_sessions (user_id, station_id, vehicle_id, vehicle_model_id, started_at, expires_at)
select u.id, s.id, v.id, v.model_id, now() - interval '10 minutes', now() + interval '50 minutes'
from (values ('00000000-0000-0000-0000-000000000002'::uuid,'d1'),('00000000-0000-0000-0000-000000000004'::uuid,'d1'),
             ('00000000-0000-0000-0000-000000000003'::uuid,'d2'),('00000000-0000-0000-0000-000000000005'::uuid,'d3'),
             ('00000000-0000-0000-0000-000000000006'::uuid,'d4')) x(uid, sid)
join auth.users u on u.id = x.uid join charging_stations s on s.source_id = x.sid
join user_vehicles v on v.user_id = u.id;

-- Lena hat Max bereits (Freundschaft) geliked → Match beim Swipe
insert into swipes (swiper_id, target_id, direction, mode, station_id)
values ('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000001','like','friendship',(select id from charging_stations where source_id='d1'));

-- Community-Bewertungen (fiktive Bewerter)
do $$
declare
  m record; i int; uid uuid; base int;
begin
  for m in select id, make, model, row_number() over () as rn from vehicle_models
           where (make, model, variant) in (('Hyundai','Ioniq 5','84 kWh'),('Tesla','Model Y','Long Range'),('Kia','EV6','84 kWh'),
             ('Volkswagen','ID.7 Tourer','Pro'),('BMW','i4','eDrive40'),('Škoda','Enyaq','85'),('Renault','R5 E-Tech','52 kWh'),
             ('Porsche','Taycan',''),('MG','MG4 Electric','64 kWh'),('Volkswagen','ID.3','Pro S'),('Polestar','2','Long Range'),('BYD','Seal',''))
  loop
    for i in 1..(4 + (m.rn % 6)) loop
      uid := gen_random_uuid();
      insert into auth.users values (uid, uid::text||'@rater');
      insert into profiles (id, display_name, birthdate, gender) values (uid, (array['Tom','Eva','Paul','Nina','Lars','Ida','Ben','Mara'])[1 + i % 8], '1985-01-01', 'diverse');
      insert into user_vehicles (user_id, model_id, is_primary) values (uid, m.id, true);
      base := 3 + ((m.rn + i) % 3);
      insert into vehicle_ratings (user_id, model_id, range_real, charging_speed, consumption, software, comfort, build_quality, value_for_money, comment)
      values (uid, m.id, least(5, base), least(5, base + (m.rn % 2)), greatest(1, base - (i % 2)), least(5, greatest(1, base - 1 + (i % 3))), least(5, base), least(5, base + (i % 2)), least(5, greatest(1, base - (m.rn % 3) + 1)),
        case when i = 1 then (array['Im Alltag top, auf der Autobahn bei 130 deutlich mehr Verbrauch als erwartet.','Lädt an HPC-Säulen richtig schnell – 10–80 % in gut 20 Minuten.','Software hat ein paar Macken, sonst sehr zufrieden.','Bequem auf Langstrecke, Platz für die ganze Familie.'])[1 + m.rn % 4] end);
    end loop;
  end loop;
end $$;
