# KKLIJP v2 Render-ready

Render settings:

Build Command:
```
npm install && npm run build
```

Start Command:
```
npm start
```

Environment variables:
```
KKLIJP_ADMIN_PASSWORD=je_admin_wachtwoord
YOUTUBE_API_KEY=je_youtube_api_key
```

Deze build gebruikt geen Express/Cors/Dotenv en heeft geen production dependencies. De frontend staat prebuilt in /dist en de API draait via pure Node in server/index.js.
