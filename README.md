# Minecraft Server Website

The stats website for our Minecraft server (MineHosting). It reads the stats live from **Supabase** and shows:

- who is **online** right now (and who is AFK),
- **top lists**: most playtime, top builders, top miners, monster hunters, most advancements,
- a **players** page with every player (sortable and searchable) and a page for each player,
- a **clans** page: every clan with its tag, members (owner, officers), how many are online and how much they played. The clan tag is also shown next to player names everywhere.
- a **commands** page ("Befehle"): every command of the server, explained in German.

The whole website is in **German**.

There is **no money** on this website, and the contents of the clan chests are never shown.

![Preview of the website](docs/preview.png)

**Address of the website:** https://toni01837463829.github.io/MinecraftServerWebsite/

---

## Test everything on your PC (Docker)

You can try everything on your own PC first. The Docker test works like the real thing:
a Postgres database with the same REST API as Supabase, and the website like on GitHub Pages.
It starts **empty**; your test Minecraft server on your PC fills it with your real data.

1. Install **Docker Desktop**: https://www.docker.com/products/docker-desktop/ and start it.
2. Open the folder of this repository, then the folder `docker`. Click into the address bar, type `powershell` and press **Enter**.
3. Type:

   ```
   docker compose up
   ```

   The first time it downloads a few things (1–3 minutes). Leave this window open.
4. Put this into `plugins/ClyroLandeszentrale/config.yml` of your **test** Minecraft server
   (for example `D:\repos\MinecraftPlugin\server\plugins\ClyroLandeszentrale\config.yml`, **not** the one in `src`), then restart that server:

   ```yaml
   supabase:
     enabled: true
     url: "http://127.0.0.1:8080"
     secret-key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoibG9jYWwtZG9ja2VyLXRlc3QifQ.IvG1-sTkHzoKDzHLlNiwctsvuiJWESlJlfR0wRYoVLQ"
     sync-seconds: 30
   ```

   This test key only works for the Docker test on your PC. The console must say
   `Connected to Supabase (http://127.0.0.1:8080). Stats are copied every 30 s for the website.`
5. Join the server and open **http://localhost:8080**. After about 30 seconds you see yourself there.
6. Stop it with **Ctrl+C** in the PowerShell window. Your test data stays for next time.
   To delete all test data and start empty: `docker compose down -v`

**Only want to look at the website, without a Minecraft server?** While `docker compose up` runs, open a second PowerShell in the `docker` folder and type:

```
Get-Content demo-data.sql | docker compose exec -T db psql -U postgres
```

This adds made-up players and clans. Remove them again with `docker compose down -v`.

**Coming from the old MySQL test?** Run `docker compose down -v` once in the `docker` folder before `docker compose up`, so the old MariaDB data is removed.

---

## Setup (step by step)

You need: your Supabase project, your Minecraft server (MineHosting panel) and this GitHub repository.
It takes about 15 minutes.

```
Minecraft server ── secret key ──▶ Supabase ◀── publishable key (read only) ── Website (GitHub Pages)
```

- The **plugin** writes the stats into Supabase with the **secret key**. Only your server knows it.
- The **website** reads them with the **publishable key**. That key can only *read*, so it may be public.

### Step 1 – Make the tables in Supabase

1. Open your project on https://supabase.com/dashboard.
2. On the left, click **SQL Editor**.
3. Open the file [`supabase/schema.sql`](supabase/schema.sql) of this repository, copy **all** of it and paste it into the editor.
4. Click **Run** (bottom right). It should say **Success. No rows returned**.
5. Check: on the left, click **Table Editor**. You see 5 tables: `players`, `online_players`, `clans`, `clan_members`, `server_status`. They are empty for now.

Running the file again later is safe. It never deletes data.

### Step 2 – Copy the address and the two keys

1. On the left, click **Project Settings** (the gear ⚙️ at the bottom).
2. Click **Data API**. Copy the **Project URL**, for example `https://abcd.supabase.co`. This is your **URL**.
   (On the same page, the Data API must be switched **on**.)
3. Click **API Keys**. If you see no keys there, click **Create new API keys**.
   - **Publishable key** (starts with `sb_publishable_`): copy it. It goes to **GitHub** (Step 4).
   - **Secret key** (starts with `sb_secret_`): click the eye 👁 or the copy button. It goes **only** into the plugin's `config.yml` (Step 3).

> 🔒 **The secret key is like a password.** Never put it on the website, in GitHub, in a chat or a screenshot.
> If it ever leaks: **API Keys** → the three dots next to it → delete, then create a new secret key and put the new one into `config.yml`.

### Step 3 – Tell the plugin (on the Minecraft server)

1. Build and upload the newest plugin `.jar` (README of the MinecraftPlugin repository, Parts 1–2).
2. In the MineHosting panel, **stop** the server.
3. In the file manager, open `plugins/ClyroLandeszentrale/config.yml`.
4. Change the `supabase:` part at the bottom like this, with **your** URL and **secret** key:

   ```yaml
   supabase:
     enabled: true
     url: "https://abcd.supabase.co"
     secret-key: "sb_secret_..."
     sync-seconds: 30
   ```

   Keep the quotes `"`. Use 2 spaces at the start of the lines, no tabs.
   (An old `database:` part from the MySQL version is removed by the plugin by itself.)
5. **Save** and **start** the server. After a few seconds the console says:

   `Connected to Supabase (https://abcd.supabase.co). Stats are copied every 30 s for the website.`

6. Check: in Supabase, **Table Editor** → `players`. After 30 seconds you see the players there.

If the console says `Could not copy stats to Supabase`, the end of that line says what to do:

| Message | What to do |
|---|---|
| `The tables don't exist yet` | Do Step 1. |
| `No access to the tables` | Run `schema.sql` again (Step 1). Check that `secret-key` is the **secret** key. |
| `Supabase did not accept the key` | The `secret-key` is wrong or is the publishable key. Copy it again (Step 2). |
| `Wrong address` / `Supabase can't be reached` | Check `url`. It must look like `https://abcd.supabase.co`, nothing after `.co`. |
| `config.yml: supabase.secret-key is the PUBLISHABLE key` | You put the wrong key in. Use the `sb_secret_` one. |

The game always keeps working, even if Supabase doesn't. Stats are saved on the server and copied later.

### Step 4 – Tell the website (GitHub)

1. Open https://github.com/Toni01837463829/MinecraftServerWebsite → **Settings**.
2. Make the repository **public** (needed for free GitHub Pages): at the very bottom, **Danger Zone** → **Change visibility** → **Change to public**. Nothing secret is in this repository.
3. On the left, click **Secrets and variables** → **Actions**, then the tab **Variables** → **New repository variable** (the tab **Secrets** works too, if you prefer). Add:

   | Name (copy it exactly) | Value |
   |---|---|
   | `SUPABASE_URL` | your **URL**, e.g. `https://abcd.supabase.co` |
   | `SUPABASE_PUBLISHABLE_KEY` | your **publishable** key (`sb_publishable_...`) |
   | `SERVER_NAME` (optional) | e.g. `Clyro Server`, shown at the top of the website |
   | `SERVER_ADDRESS` (optional) | e.g. `play.yourserver.net`, shown as "Spiel mit: ..." |

   No spaces before or after the values.

   Why the publishable key may be public: the website runs in the visitor's browser, so the browser must get this key; anyone can see it in the page's `config.js`, no matter where you store it in GitHub. That's how Supabase designed it: with this key, the tables can only be **read** (Row Level Security in `schema.sql`), never changed. The **secret** key is the one that must stay hidden, and it's only on your Minecraft server.
4. On the left, click **Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
5. Click the tab **Actions** (top). If GitHub asks, click **I understand my workflows, go ahead and enable them**.
   On the left click **Update website**, on the right **Run workflow** → **Run workflow**.
6. After about 1 minute the run has a green ✅. Open the website:
   **https://toni01837463829.github.io/MinecraftServerWebsite/**

The website reads the stats live from Supabase and refreshes every minute by itself.
You only need to run the workflow again when you change a variable or the website code (a push to `main` runs it too).

**Old secrets from the MySQL version** (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`) are not used anymore. Delete them under **Secrets and variables → Actions → Secrets**.

### Something doesn't work?

| The website says | What to do |
|---|---|
| **Nicht eingerichtet** / "noch nicht mit Supabase verbunden" | The variables are missing or have a wrong name (Step 4.3). Then run the workflow again. |
| "Der Schlüssel der Webseite stimmt nicht" | `SUPABASE_PUBLISHABLE_KEY` is wrong. Copy it again from Supabase, then run the workflow again. |
| "Die Datenbank ist noch nicht eingerichtet" | Do Step 1. |
| **Server offline** | The plugin hasn't written for 5 minutes: the Minecraft server is stopped, or the plugin can't reach Supabase (look at the server console, Step 3). |
| **Keine Daten** | Supabase can't be reached right now, or `SUPABASE_URL` is wrong. |

If the workflow run has a red ❌ with "SUPABASE_PUBLISHABLE_KEY is the SECRET key": you put the secret key into GitHub.
Delete that variable, **delete that secret key in Supabase** and make a new one (it is not secret anymore), then use the publishable key.

**Free Supabase projects are paused after 7 days without any use.** While your Minecraft server runs, the plugin uses it every 30 seconds, so this only happens if the server is off for a week. Then open the Supabase dashboard and click **Restore project**.

---

## For developers

- `site/` – the website (plain HTML, CSS and JavaScript, no build tools). `app.js` reads the 5 tables from Supabase's REST API (`/rest/v1/...`) with the publishable key from `config.js` and refreshes every 60 s while the page is visible.
- `site/config.js` – empty by default ("not set up"). The workflow overwrites it with the repository variables.
- `supabase/schema.sql` – the tables, read-only access for the website (Row Level Security) and write access for the plugin's secret key.
- `.github/workflows/deploy.yml` – writes `config.js` and publishes `site/` on GitHub Pages (on push to `main` and "Run workflow").
- `docker/` – the test setup: Postgres (runs `roles.sql` and `supabase/schema.sql` at the first start), PostgREST (the REST API Supabase uses) and `test-website.mjs` (serves `site/` and passes `/rest/v1/` to PostgREST, like Supabase). `demo-data.sql` has optional made-up players.

Tables: `players`, `online_players`, `clans`, `clan_members`, `server_status` (columns: see `supabase/schema.sql`). All times are milliseconds since 1970.
