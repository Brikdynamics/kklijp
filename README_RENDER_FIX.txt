KKLIJP v1.5.4 Render Fix

Deze build gebruikt GEEN Express/Cors/Dotenv meer.
Daarmee zijn de Render errors opgelost:
- Cannot find package express
- Cannot find package cors
- Cannot find package dotenv
- Cannot find module ./router

Render settings:
Build Command: npm install && npm run build
Start Command: npm start

Environment variables op Render:
KKLIJP_ADMIN_PASSWORD=je_admin_wachtwoord
YOUTUBE_API_KEY=je_youtube_api_key

Lokaal testen:
npm install
npm start
open http://localhost:8787

Let op:
.env zit bewust niet in deze zip. Zet secrets alleen in Render Environment Variables.
