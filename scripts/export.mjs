// Reads the stats that the Minecraft plugin copied into the MySQL/MariaDB database and writes
// the finished website into the folder _site/ (the page files from site/ plus data/stats.json).
//
// It runs on GitHub Actions (see .github/workflows/deploy.yml). The database login comes from the
// repository's secrets as environment variables, so it is never part of the website itself:
//   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD   (secrets, required)
//   DB_TABLE_PREFIX (default "mc_"), DB_SSL ("true" for an encrypted connection)   (optional)
//   SERVER_NAME, SERVER_ADDRESS   (optional repository variables, shown on the website)
//
// If the secrets are missing, the website is still built and says "not set up yet".
// If the database can't be reached, the last published stats are kept (fetched from the live site).

import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import mysql from "mysql2/promise";

const env = name => (process.env[name] || "").trim();
const OUT = "_site";
// The plugin writes every 30 s by default. Older than this means the server is off.
const SERVER_STALE_MS = 5 * 60 * 1000;

const config = {
  host: env("DB_HOST"),
  port: Number(env("DB_PORT") || 3306),
  database: env("DB_NAME"),
  user: env("DB_USER"),
  password: process.env.DB_PASSWORD || "",
  prefix: env("DB_TABLE_PREFIX") || "mc_",
  ssl: env("DB_SSL").toLowerCase() === "true",
};
const site = { name: env("SERVER_NAME"), address: env("SERVER_ADDRESS") };

if (!/^[A-Za-z0-9_]{0,20}$/.test(config.prefix)) {
  throw new Error("DB_TABLE_PREFIX may only use letters, numbers and _");
}
// People sometimes paste "host:3306" into DB_HOST. Split it so it still works.
if (/^[^:]+:\d+$/.test(config.host)) {
  const [h, p] = config.host.split(":");
  config.host = h;
  if (!env("DB_PORT")) config.port = Number(p);
}

async function readDatabase() {
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    connectTimeout: 15000,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    supportBigNumbers: true,
  });
  try {
    const t = name => "`" + config.prefix + name + "`";
    const [players] = await connection.query(`SELECT * FROM ${t("players")}`);
    const [online] = await connection.query(`SELECT * FROM ${t("online")}`);
    const [servers] = await connection.query(`SELECT * FROM ${t("server")} WHERE id = 1`);
    return { players, online, server: servers[0] };
  } finally {
    await connection.end();
  }
}

function toNumber(value) {
  return Number(value || 0);
}

function build({ players, online, server }) {
  const now = Date.now();
  const serverUpdated = server ? toNumber(server.updated_at) : 0;
  const up = !!server && now - serverUpdated < SERVER_STALE_MS;
  const onlineById = new Map(up ? online.map(o => [o.uuid, o]) : []);
  return {
    configured: true,
    generatedAt: now,
    server: {
      name: site.name || firstLine(server?.motd) || "Minecraft Server",
      address: site.address,
      motd: server?.motd || "",
      version: server?.version || "",
      maxPlayers: toNumber(server?.max_players),
      onlineCount: onlineById.size,
      updatedAt: serverUpdated,
      up,
    },
    players: players.map(r => {
      const o = onlineById.get(r.uuid);
      return {
        uuid: r.uuid,
        name: r.name,
        firstJoin: toNumber(r.first_join),
        lastSeen: toNumber(r.last_seen),
        playtime: toNumber(r.playtime_seconds),
        activeTime: toNumber(r.active_seconds),
        blocksPlaced: toNumber(r.blocks_placed),
        blocksBroken: toNumber(r.blocks_broken),
        deaths: toNumber(r.deaths),
        mobKills: toNumber(r.mob_kills),
        playerKills: toNumber(r.player_kills),
        advancements: toNumber(r.advancements),
        online: !!o,
        afk: !!o && !!o.afk,
        world: o ? o.world : "",
      };
    }),
  };
}

function firstLine(text) {
  return String(text || "").split("\n")[0].trim();
}

/** The stats that are online right now, so a short database problem doesn't empty the website. */
async function previousStats() {
  const url = env("PAGES_URL");
  if (!url) return null;
  try {
    const r = await fetch(url.replace(/\/+$/, "") + "/data/stats.json", { cache: "no-store" });
    if (!r.ok) return null;
    const data = await r.json();
    return data && data.configured ? data : null;
  } catch {
    return null;
  }
}

async function main() {
  let data;
  if (!config.host || !config.database || !config.user) {
    console.log("::warning::The database secrets (DB_HOST, DB_NAME, DB_USER, DB_PASSWORD) are not set yet. "
      + "The website is built without stats. See README.md, Setup.");
    data = { configured: false, generatedAt: Date.now(), server: { name: site.name || "Minecraft Server", address: site.address }, players: [] };
  } else {
    try {
      data = build(await readDatabase());
      console.log(`Read ${data.players.length} players, ${data.server.onlineCount} online, server ${data.server.up ? "up" : "offline"}.`);
    } catch (e) {
      const reason = explain(e);
      console.log(`::error::Could not read the database (${config.user}@${config.host}:${config.port}/${config.database}): ${reason}`);
      const old = await previousStats();
      if (!old) {
        // Nothing to fall back to: fail, so the problem shows up as a red X on the Actions page.
        process.exitCode = 1;
        return;
      }
      // Only a short hint goes on the public website, never the raw error (it can contain the user name).
      data = { ...old, error: e && KNOWN[e.code] ? KNOWN[e.code] : "see the log of the Update website workflow" };
      console.log("Keeping the stats from the last successful update.");
    }
  }
  await rm(OUT, { recursive: true, force: true });
  await cp("site", OUT, { recursive: true });
  await mkdir(`${OUT}/data`, { recursive: true });
  await writeFile(`${OUT}/data/stats.json`, JSON.stringify(data));
  console.log(`Website written to ${OUT}/`);
}

/** Short hints in simple words for the usual database errors. */
const KNOWN = {
  ER_ACCESS_DENIED_ERROR: "user name or password is wrong, or the database doesn't allow connections from outside (set 'Connections from' to %)",
  ENOTFOUND: "the host name (DB_HOST) was not found",
  ETIMEDOUT: "the database can't be reached from the internet (check DB_HOST, DB_PORT and that remote connections are allowed)",
  ECONNREFUSED: "the database can't be reached from the internet (check DB_HOST, DB_PORT and that remote connections are allowed)",
  ER_BAD_DB_ERROR: "the database name (DB_NAME) is wrong",
  ER_NO_SUCH_TABLE: "the tables don't exist yet: switch on the database in the plugin's config.yml and start the server once",
};

/** Turns a database error into a short hint for the Actions log. */
function explain(e) {
  const code = e && e.code;
  if (KNOWN[code]) return KNOWN[code];
  return (code ? code + ": " : "") + (e && e.message ? e.message : String(e));
}

main();
