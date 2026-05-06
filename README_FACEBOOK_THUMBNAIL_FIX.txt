KKLIJP v3.1 Facebook thumbnail fix

Deze build herstelt de Facebook thumbnail lookup uit de oude build en maakt hem robuuster:
- probeert originele URL
- volgt fb.watch/share redirects
- probeert /reel/{id}, m.facebook.com/reel/{id}, /watch/?v={id}
- probeert Facebook oEmbed endpoint
- parseert og:image, twitter:image en JSON thumbnail velden

Belangrijk:
- Reeds geïmporteerde pending Facebook reels krijgen niet automatisch achteraf een thumbnail.
- Verwijder die pending imports en importeer de batch opnieuw, of plak handmatig een thumbnail in het adminpaneel.

Railway:
- Build Command: npm install && npm run build
- Start Command: npm start
- Variables: DATABASE_URL, KKLIJP_ADMIN_PASSWORD, YOUTUBE_API_KEY, PGSSL=false
