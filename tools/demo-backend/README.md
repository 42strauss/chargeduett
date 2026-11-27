# Demo-Backend (nur für lokale UI-Tests)

Ein winziger Nachbau der Supabase-Schnittstellen (Auth, REST, RPC, Storage) auf einer lokalen
Postgres-Datenbank mit den echten Migrationen. Damit lässt sich die Web-Version der App ohne
Supabase-Projekt durchklicken. **Nicht sicher, nicht für Produktion.**

1. Lokale DB `demo` anlegen und `supabase/tests/00_supabase_stub.sql`, alle Migrationen,
   `supabase/seed/vehicle_models.sql` und `demo_seed.sql` einspielen.
2. Web-Build mit `EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321 EXPO_PUBLIC_SUPABASE_ANON_KEY=demo npx expo export --platform web --output-dir /tmp/webdemo`
3. `npm i pg playwright` in diesem Ordner, dann
   `STATIC_DIR=/tmp/webdemo OUT=./shots DB=demo node run.mjs`
   (Postgres-Socket ist in `server.mjs` auf `/tmp/pgt:5499` eingestellt – ggf. anpassen.)

Demo-Login: `max@demo.chinder` / `demo12345`. Personen und Stationen sind frei erfunden.
