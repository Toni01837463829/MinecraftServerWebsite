# Minecraft Server Website

The stats website for our Minecraft server (MineHosting). It shows:

- who is **online** right now (and who is AFK),
- **top lists**: most playtime, top builders, top miners, monster hunters, most advancements,
- a **players** page with every player (sortable and searchable) and a page for each player,
- a **clans** page: every clan with its tag, members (owner, officers), how many are online and how much they played. The clan tag is also shown next to player names everywhere.

There is **no money** on this website, and the contents of the clan chests are never shown.

![Preview of the website](docs/preview.png)

**Address of the website:** https://toni01837463829.github.io/MinecraftServerWebsite/

---

## How it works (short)

```
Minecraft server (MineHosting)          GitHub (every 10 minutes)                 Website (GitHub Pages)
plugin "Clyro" ── copies stats ──▶ MySQL database ──▶ reads the stats ──▶ builds the page ──▶ everyone can see it
                                         ▲
                                         └── uses the secrets DB_HOST, DB_USER, DB_PASSWORD ...
```

1. The Minecraft plugin (repository **MinecraftPlugin**, branch **MineHosting**) copies the player stats and clans into a MySQL database every 30 seconds.
2. Every 10 minutes, GitHub runs the workflow **"Update website"**. It logs in to the database with the **secrets** you saved in this repository, reads the stats and builds the website.
3. GitHub Pages shows the website.

🔒 The database password is **only** in the GitHub secrets. It is **never** in the website, and nobody can see it — not even on the public repository page.

---

## Setup (step by step)

Do the plugin and database setup first (README of the **MinecraftPlugin** repository, branch **MineHosting**, Parts 1–5).
You need these 5 values from your MineHosting database (Part 4 there):

- **HOST** (for example `db1.minehosting.de`, without `:3306`)
- **PORT** (usually `3306`)
- **DATABASE NAME**
- **USER**
- **PASSWORD**

### Step 1 – Make this repository public

GitHub Pages is free for **public** repositories. (For private ones you need a paid GitHub plan.)
Public means: everyone can see the website code. The **secrets stay secret**.

1. Open https://github.com/Toni01837463829/MinecraftServerWebsite
2. Click **Settings** (the gear ⚙️ at the top right of the repository).
3. Scroll all the way down to **"Danger Zone"**.
4. Click **Change visibility** → **Change to public** and confirm.

### Step 2 – Add the secrets

1. In **Settings**, on the left side, click **Secrets and variables** → **Actions**.
2. You are on the tab **Secrets**. Click the green button **New repository secret**.
3. **Name:** `DB_HOST` – **Secret:** your HOST → click **Add secret**.
4. Do the same for the other 4 secrets:

   | Name (copy it exactly) | Secret (the value) |
   |---|---|
   | `DB_HOST` | HOST, e.g. `db1.minehosting.de` |
   | `DB_PORT` | PORT, e.g. `3306` |
   | `DB_NAME` | DATABASE NAME |
   | `DB_USER` | USER |
   | `DB_PASSWORD` | PASSWORD |

   The names must be written **exactly** like this (big letters, with `_`).
   No spaces before or after the value.

### Step 3 – Optional: name and address of your server

These are not secret, so they are **variables** (same page, tab **Variables**, button **New repository variable**):

| Name | Value | What it does |
|---|---|---|
| `SERVER_NAME` | e.g. `Clyro Server` | The name at the top of the website. Without it, the first line of the server's MOTD is used. |
| `SERVER_ADDRESS` | e.g. `play.yourserver.net` | Shows "Join us: ..." on the website, so friends know where to connect. |

### Step 4 – Switch on GitHub Pages

1. In **Settings**, on the left side, click **Pages**.
2. Under **Build and deployment** → **Source**, choose **GitHub Actions**.

(That's all. You don't need to choose a branch.)

### Step 5 – Start the first update

1. Click the tab **Actions** (at the top of the repository).
2. If GitHub asks, click **"I understand my workflows, go ahead and enable them"**.
3. On the left, click **Update website**.
4. On the right, click **Run workflow** → green **Run workflow** button.
5. Wait about 1 minute. When the run has a **green check ✅**, open your website:

   **https://toni01837463829.github.io/MinecraftServerWebsite/**

From now on the website updates by itself **every 10 minutes**.

---

## Something doesn't work?

Open **Actions** → click on the newest **Update website** run → click **build** → open the step **"Read the stats from the database"**. It tells you what's wrong in simple words:

| Message | What to do |
|---|---|
| `The database secrets ... are not set yet` | Do Step 2. Check that the secret names are written exactly right. |
| `user name or password is wrong, or the database doesn't allow connections from outside` | Check `DB_USER` and `DB_PASSWORD`. In the MineHosting panel, the database must allow connections from `%` (everywhere). |
| `the host name (DB_HOST) was not found` | Check `DB_HOST`. Only the address, without `https://` and without `:3306`. |
| `the database can't be reached from the internet` | Check `DB_HOST` and `DB_PORT`. Your database must allow connections from outside. Some hosting plans don't allow this – then ask MineHosting support "Can I connect to my MySQL database from outside (remote access)?" |
| `the database name (DB_NAME) is wrong` | Check `DB_NAME`. |
| `the tables don't exist yet` | In the plugin's `config.yml`, set `database: enabled: true` and restart the Minecraft server. Wait 1 minute and try again. |

You can change a secret any time: **Settings → Secrets and variables → Actions → ✏️ (pencil) next to the secret**. Then run the workflow again (Step 5).

The website says **"Server offline"** when the plugin hasn't written to the database for 5 minutes (for example when the Minecraft server is stopped).

### The website stopped updating after a long time?

GitHub pauses timed workflows in public repositories when nothing changed in the repository for **60 days**. You get an e-mail from GitHub. To start it again: **Actions → Update website → "Enable workflow"**.

---

## For developers

- `site/` – the website itself (plain HTML, CSS and JavaScript, no build tools). It only reads `data/stats.json`.
- `scripts/export.mjs` – reads the database (tables `mc_players`, `mc_online`, `mc_clans`, `mc_clan_members`, `mc_server`) and writes `_site/` = `site/` + `data/stats.json`.
- `.github/workflows/deploy.yml` – runs the export every 10 minutes and publishes `_site/` on GitHub Pages.

Optional repository **variables**: `DB_TABLE_PREFIX` (default `mc_`, must match `database.table-prefix` in the plugin), `DB_SSL` (`true` for an encrypted database connection).

Try it on your own PC (needs Node.js 20 or newer):

```
npm install
set DB_HOST=... & set DB_NAME=... & set DB_USER=... & set DB_PASSWORD=...
npm run preview
```

Without the `DB_...` values it builds the website in "not set up yet" mode.
