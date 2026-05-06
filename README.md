# KKLIJP v1.4

Volledige lokale build van KKLIJP: frontend + backend + JSON-database.

## Starten

```bash
npm install
cp .env.example .env
npm run dev
```

Open daarna:

```text
http://localhost:5173
```

## Admin

Standaard adminwachtwoord:

```text
ADMIN2026
```

Aanpassen in `.env`:

```env
KKLIJP_ADMIN_PASSWORD=jouw_wachtwoord
YOUTUBE_API_KEY=jouw_youtube_api_key
```

## v1.4 wijzigingen

- KK-logo kleur gelijk aan ×_×.
- Website Nederlandstalig gemaakt.
- Rechterblok heet nu `Lijpste video's` en toont een toplijst.
- Videomodal toont nu speler + info + delen + reacties overzichtelijk onder elkaar.
- Categorieën tonen aantallen.
- Meer Nederlandse categorie-keywords voor betere herkenning.
- Flood protection voor uploads en reacties blijft actief.
