# KEYLIGHT

A piano-tiles rhythm game plus a real-piano listening mode (mic pitch detection),
with a shared leaderboard and a feedback box. ~140 public-domain songs.

## Run locally
```
npm install
npm start
```
Then open http://localhost:3000

## Project layout
```
public/index.html   the whole app (works on its own too; mic needs https or localhost)
server.js           Express server: serves the app + /api for scores & feedback
package.json        dependency (express) and the start script
```

## Deploy on Render
1. Put these files in a GitHub repo (keep `public/index.html` inside a `public` folder).
2. On Render: New + → Web Service → connect the repo.
3. Language **Node**, Build command `npm install`, Start command `npm start`, Instance **Free**.
4. Deploy. Your app is at the `onrender.com` URL Render gives you.

### Admin (in-app)
On the menu, the **Admin** link opens a PIN box. The PIN unlocks a panel that shows all
feedback and has a **Clear leaderboard** button. Default PIN is **160417**. The PIN is
checked on the server and is never written into the page, so viewing the page source
doesn't reveal it. To change it, set the env var `ADMIN_PIN` on Render.

(Also available: set `ADMIN_KEY` and read feedback as JSON at
`https://YOUR-APP.onrender.com/api/feedback?key=YOUR_SECRET`.)

### Keeping data across restarts
The free tier's disk is wiped on restart/redeploy, so the shared leaderboard resets.
To keep it: use a paid instance, add a **Disk** mounted at `/var/data`, and set the
env var `DATA_DIR=/var/data`. (Players' own scores still persist in their browser regardless.)
