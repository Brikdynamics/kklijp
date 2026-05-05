KKLIJP v1.5.2 - Render fixed

Deze build gebruikt een vooraf gebouwde frontend in /dist.
Daardoor hoeft Render GEEN Vite/React build meer te draaien en krijg je geen 127 error meer.

Render settings:
Build Command: npm install && npm run build
Start Command: npm start

Environment variables:
NODE_VERSION=20.18.1
KKLIJP_ADMIN_PASSWORD=jouw_admin_wachtwoord
YOUTUBE_API_KEY=jouw_youtube_api_key

PowerShell update naar GitHub:
git add .
git commit -m "fix render build v1.5.2"
git push

Daarna in Render:
Manual Deploy -> Clear build cache & deploy
