KKLIJP v3 DATABASE BUILD
========================

Deze versie gebruikt GEEN JSON-opslag meer als live database.
Video's, reacties, likes, usernames en admin-aanpassingen worden opgeslagen in PostgreSQL.

AANBEVOLEN HOSTING
------------------
Optie A: Railway
1. Maak een nieuw Railway project.
2. Voeg een PostgreSQL database toe.
3. Deploy deze repo als Node app.
4. Railway geeft automatisch DATABASE_URL door als environment variable.
5. Zet ook:
   KKLIJP_ADMIN_PASSWORD=je_admin_wachtwoord
   YOUTUBE_API_KEY=je_youtube_api_key  (optioneel maar aanbevolen)
   PGSSL=true

Optie B: Render + Supabase Postgres
1. Maak een Supabase project.
2. Kopieer de Postgres connection string.
3. Zet in Render environment variables:
   DATABASE_URL=postgresql://...
   KKLIJP_ADMIN_PASSWORD=je_admin_wachtwoord
   YOUTUBE_API_KEY=je_youtube_api_key
   PGSSL=true
4. Render settings:
   Build Command: npm install && npm run build
   Start Command: npm start

BELANGRIJK
----------
Zonder DATABASE_URL draait de homepage wel, maar API-acties geven een melding dat DATABASE_URL ontbreekt.
Dat is bewust: data moet persistent in Postgres staan.

AUTO-MIGRATIE
-------------
Als server/data/db.json nog oude video's bevat en de Postgres database leeg is, importeert de server die automatisch bij eerste start.
Daarna gebruikt KKLIJP alleen PostgreSQL.

COMMANDS LOKAAL
---------------
npm install
npm start

Render/Railway:
Build Command: npm install && npm run build
Start Command: npm start
