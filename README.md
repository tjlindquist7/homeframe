# HomeFrame

HomeFrame is a 1280 × 800 Raspberry Pi dashboard for NJ TRANSIT and ferry departures, the morning drive to Hackensack, Weehawken weather, and a private read-only Google Calendar feed.

## Local setup

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Fill in `.env.local` with the NJ TRANSIT credentials, Google Maps Routes API key, and private Google Calendar iCal URL. `.env.local` is ignored by Git and must never be committed.

## Raspberry Pi installation

HomeFrame is designed to sit beside Tideframe under the same Raspberry Pi user account. It uses port `3000`; Tideframe can continue using port `5173`.

```bash
cd "$HOME"
git clone https://github.com/tjlindquist7/homeframe.git
cd homeframe
cp .env.example .env.local
nano .env.local
chmod +x scripts/*.sh
./scripts/install-pi-desktop-shortcut.sh
```

After adding the four private values to `.env.local`, double-click the **HomeFrame** desktop icon. The launcher loads the credentials, starts the production build on `127.0.0.1:3000`, waits for it to become ready, and opens Chromium in kiosk mode.

Use the **X** button in HomeFrame's top-right corner to close the kiosk window and return to the Raspberry Pi desktop. The launcher also stops HomeFrame's local server when the window closes, so Tideframe and HomeFrame can be opened independently from their desktop icons.

## Updating the Pi

```bash
cd "$HOME/homeframe"
git pull --ff-only
npm ci
npm run build
```

The Pi's `.env.local` remains untouched by Git updates.
