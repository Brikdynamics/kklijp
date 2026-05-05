# KKLIJP v1.5 Render-ready

Volledige build: frontend + backend + JSON-database + adminpaneel.

## Lokaal starten

```bash
npm install
cp .env.example .env
npm run dev
```

Open:

```text
http://localhost:5173
```

## Render deploy

Maak een **Node Web Service** op Render.

Build command:

```bash
npm install && npm run build
```

Start command:

```bash
npm start
```

Environment variables op Render:

```text
YOUTUBE_API_KEY=jouw_youtube_api_key
KKLIJP_ADMIN_PASSWORD=jouw_admin_wachtwoord
```

Zet **geen** `VITE_API_URL` op Render. De frontend en backend draaien op dezelfde service.

## Admin

Standaard adminwachtwoord als je niks instelt:

```text
ADMIN2026
```

## v1.5 wijzigingen

- Render-ready: backend serveert nu automatisch de Vite frontend uit `/dist`.
- `Cannot GET /` opgelost.
- Admin batch-import toegevoegd voor maximaal 200 video's tegelijk.
- Batchregels ondersteunen: `link`, `link | titel`, `link | titel | naam`.
- Batch kan direct goedkeuren of in de wachtrij zetten.
- Admin kan bestaande video's bewerken: titel, plaatsernaam, categorie, tags, thumbnail en link.
- Admin-knoppen versimpeld naar: accepteren, bewerken, verwijderen.
- Oude losse `Opslaan`-button verwijderd.
