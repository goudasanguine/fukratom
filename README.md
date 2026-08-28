# Fuck Kratom

A private, no-login day tracker for staying kratom-free. Built as a plain HTML/CSS/JS
app so it can be hosted for free on GitHub Pages and installed on a phone like a real app.

## What it does

- Big "days clear" counter based on a sobriety start date, recalculated automatically
- A "money saved" total, based on an estimated daily cost (defaults to $45/day —
  editable in Settings) times clear days
- A monthly calendar — clear days in green, logged slips in amber, a dot on any day with a note
- Tap any past day to add a private note or mark/unmark it as a slip (for backdating)
- Longest streak, total clear days, and slip count at a glance
- Milestone badges (1 day, 1 week, 1 month, 3 months, 6 months, 1 year, etc.)
- Export/import a JSON backup, and an "erase all data" option in Settings
- Optional: a morning pledge push notification and an evening check-in reminder
  (see [Push notifications](#push-notifications-morning--evening-reminders) below)

## How data storage works

There's no server, database, or account — everything is saved in the browser's local
storage, on whichever device and browser Shawn uses it from. That means:

- It's completely private. Nothing is uploaded anywhere, not even to GitHub.
- It only lives on that one browser/device unless he exports a backup. Encourage him to
  tap **Export backup** in Settings every so often (especially before a new phone), and
  keep the downloaded `.json` file somewhere safe. **Import backup** restores it.
- If he clears his browser data/cache, the tracker resets unless he's restored a backup.

For a single person tracking on one phone, this is normal and reliable — it's the same
approach the bid-walkthrough app uses.

## Publishing it to GitHub Pages

1. Create a new **public** GitHub repository, e.g. `fuck-kratom` (Settings → your repos → New).
2. Upload these files to the repo root, keeping the folder structure:
   ```
   index.html
   styles.css
   app.js
   manifest.json
   sw.js
   icons/icon-192.png
   icons/icon-512.png
   README.md
   ```
   Easiest way: on the repo's GitHub page, use **Add file → Upload files** and drag
   everything in (including the `icons` folder).
3. Add the reminders workflow. In your Shawn App folder you'll find
   `daily-reminders.yml` sitting on its own, not inside a `.github` folder — hidden
   dot-folders don't come across cleanly this way, so it's saved flat instead. In the
   GitHub repo, use **Add file → Create new file**, type the path
   `.github/workflows/daily-reminders.yml` into the filename box (GitHub creates the
   folders for you), open `daily-reminders.yml` and paste its contents in, then
   commit.
4. Go to the repo's **Settings → Pages**.
5. Under "Build and deployment", set **Source** to `Deploy from a branch`, branch
   `main`, folder `/ (root)`. Save.
6. GitHub will publish it at `https://<your-username>.github.io/fuck-kratom/`
   (give it a minute or two after the first deploy).

## Getting it on Shawn's phone

Once the GitHub Pages link is live, open it in his phone's browser, then:

- **Android (Chrome):** tap the ⋮ menu → **Add to Home screen** / **Install app**.
- **iPhone (Safari):** tap the Share icon → **Add to Home Screen**.

It'll then open full-screen like a normal app, with the icon you generated, and works
offline once it's loaded the first time.

## Push notifications (morning & evening reminders)

Two optional reminders, sent as real push notifications from Fuck Kratom itself —
no separate app for Shawn to install, and they arrive even when the app is closed:

- **Morning (default 8:00 AM):** "I will not take kratom today." — a pledge.
- **Evening (default 8:00 PM):** "How did today go? Open Fuck Kratom and log it." —
  taps straight into the app.

This runs on [OneSignal](https://onesignal.com)'s free web push plan. Their SDK is
already wired into `index.html`, `app.js`, and `sw.js` — you just need to create a
free OneSignal app and plug in two IDs. The actual daily sending is done by a
scheduled GitHub Action already in this repo (`.github/workflows/daily-reminders.yml`),
since OneSignal's dashboard doesn't have a simple "every day at 8am" option on its own.
Nothing about Shawn's sobriety data is involved — this is a separate, one-way "send
this text at this time" mechanism.

### One-time setup

1. **Create a free OneSignal account** at [onesignal.com](https://onesignal.com) and
   click **New App/Website**.
2. Choose platform **Web Push**, then **Custom Code** (not "Typical Site" — Fuck Kratom
   already has its own service worker for offline use, and Custom Code is what lets
   OneSignal share it instead of installing a second one). Give it a name like
   "Fuck Kratom" and your GitHub Pages URL as the site URL (you can fill this in
   properly once Pages is live).
3. OneSignal will show setup code — you can skip pasting it, since it's already in the
   app's files. Finish creating the app.
4. In the OneSignal dashboard, go to **Settings → Keys & IDs**. You'll need two
   values:
   - **OneSignal App ID** — open `app.js`, find the line
     `const ONESIGNAL_APP_ID = "YOUR_ONESIGNAL_APP_ID";` near the bottom, and replace
     the placeholder with this value. This one is fine to commit — it's a public
     identifier, not a secret.
   - **REST API Key** — this one is a real secret, never put it in `app.js` or commit
     it anywhere. In the GitHub repo, go to **Settings → Secrets and variables →
     Actions → New repository secret**, name it `ONESIGNAL_REST_API_KEY`, and paste
     it in. Add a second secret named `ONESIGNAL_APP_ID` with the same App ID from
     above (the Action needs its own copy, separate from the one in `app.js`).
5. Once GitHub Pages is live (see above), open
   `.github/workflows/daily-reminders.yml` in the repo, and change the `APP_URL` line
   near the top to your actual Pages URL, e.g.:
   ```yaml
   APP_URL: "https://your-username.github.io/fuck-kratom/"
   ```
6. Re-upload the changed `index.html`/`app.js`/`sw.js` (with the real App ID in
   `app.js`) to the repo, so the deployed site matches.
7. On Shawn's phone, open the app and go to **Settings → Notifications → Enable
   notifications**, and accept the browser's permission prompt. The status line
   should change to "Notifications are on for this phone."
8. **Test it immediately** (don't wait for 8am/8pm): go to the repo's **Actions**
   tab → **Daily reminders** → **Run workflow**, pick "morning" or "evening", and run
   it. Shawn's phone should get the notification within a few seconds.

### Notes

- Reminder times default to 8:00 AM / 8:00 PM **Pacific time** and self-adjust for
  daylight saving automatically. To change the times or timezone, edit the
  `MORNING_HOUR`, `EVENING_HOUR`, and `REMINDER_TZ` values near the top of
  `daily-reminders.yml`.
- GitHub automatically pauses scheduled workflows after **60 days with no repository
  activity**. If reminders quietly stop, open the Actions tab and re-enable it (any
  small commit to the repo also resets the clock).
- Occasionally GitHub's schedule runs a few minutes late under load — that's normal
  and not something to troubleshoot.
- OneSignal's free plan covers up to 10,000 subscribers, which won't be a concern
  here — it's just Shawn's phone.
- If Shawn ever gets a new phone, he'll need to tap **Enable notifications** again
  on the new device — subscriptions don't transfer automatically.

## Making changes later

Edit `index.html`, `styles.css`, or `app.js` and re-upload the changed file(s) to the
same GitHub repo (or use `git push` if you clone it locally) — GitHub Pages redeploys
automatically within a minute or two. If you change any of the app-shell files, bump
`CACHE_NAME` in `sw.js` (e.g. `fuck-kratom-v2`) so installed phones pick up the update
instead of serving a stale cached copy.
