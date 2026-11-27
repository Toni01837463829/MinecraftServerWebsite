// Stats website. Reads the stats live from Supabase (written there by the Minecraft plugin) and draws
// the page for the current #route. It uses the publishable key from config.js, which can only READ
// the stats. No passwords or secret keys here.
"use strict";

const state = { data: null, players: [], clans: [], sort: { key: "playtime", desc: true }, query: "", page: null };
const app = document.getElementById("app");

// ---------------------------------------------------------------- helpers

function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function duration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h >= 48) return `${Math.floor(h / 24)} T ${h % 24} h`;
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

/** 1234567 cm becomes "12,3 km", 85000 cm becomes "850 m". */
function distance(cm) {
  const m = Math.floor((cm || 0) / 100);
  if (m < 1000) return `${m} m`;
  const km = m / 1000;
  return `${km.toLocaleString("de-DE", { maximumFractionDigits: km < 100 ? 1 : 0 })} km`;
}

/** Kills per death, like "3,4". Without deaths there is nothing to divide by. */
function killsPerDeath(p) {
  const kills = p.mobKills + p.playerKills;
  if (!p.deaths) return "–";
  return (kills / p.deaths).toLocaleString("de-DE", { maximumFractionDigits: 1 });
}

/**
 * For the big numbers in the tiles: "1 h 59 min" becomes 1 h 59 min with small units. Each number stays
 * together with its unit, but the parts may go onto two lines when the tile is too narrow.
 */
function units(text) {
  return esc(text).replace(/(\S+) (\S+)/g, '<span class="nb">$1<small> $2</small></span>');
}

function ago(millis) {
  const s = Math.max(0, (Date.now() - millis) / 1000);
  if (s < 60) return "gerade eben";
  if (s < 3600) return `vor ${Math.floor(s / 60)} Min.`;
  if (s < 86400) return `vor ${Math.floor(s / 3600)} Std.`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "gestern" : `vor ${d} Tagen`;
}

function date(millis) {
  return new Date(millis).toLocaleDateString("de-DE", { year: "numeric", month: "short", day: "numeric" });
}

function time(millis) {
  return new Date(millis).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function num(n) {
  return Number(n || 0).toLocaleString("de-DE");
}

// A blocky 8x8 face, shown when mc-heads.net can't be reached.
const FALLBACK_HEAD = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges">' +
  '<rect width="8" height="8" fill="#b4846a"/><rect width="8" height="2" fill="#2f1f0f"/>' +
  '<rect y="2" width="1" height="1" fill="#2f1f0f"/><rect x="7" y="2" width="1" height="1" fill="#2f1f0f"/>' +
  '<rect x="1" y="4" width="2" height="1" fill="#fff"/><rect x="2" y="4" width="1" height="1" fill="#4a3a8c"/>' +
  '<rect x="5" y="4" width="2" height="1" fill="#fff"/><rect x="5" y="4" width="1" height="1" fill="#4a3a8c"/>' +
  '<rect x="3" y="5" width="2" height="1" fill="#8c5a40"/><rect x="2" y="6" width="4" height="1" fill="#6a4030"/></svg>');

function head(uuid, cls = "head", size = 64, name = "") {
  // Player faces come from mc-heads.net. If it can't be reached, a simple face shows instead.
  // Real Minecraft accounts have version-4 UUIDs (the "4" in xxxxxxxx-xxxx-4xxx-...). Servers in offline
  // mode (online-mode=false) make up other UUIDs that mc-heads.net doesn't know, so there the name is used.
  const id = /^[0-9a-f]{8}-[0-9a-f]{4}-4/i.test(uuid) || !name ? uuid : name;
  return `<img class="${cls}" src="https://mc-heads.net/avatar/${encodeURIComponent(id)}/${size}" alt="" loading="lazy"
              onerror="this.onerror=null;this.src=FALLBACK_HEAD">`;
}

function clanTag(clan) {
  return clan ? `<span class="tag" style="--c:${esc(clan.color)}" title="${esc(clan.name)}">${esc(clan.tag)}</span>` : "";
}

function statusPill(p) {
  if (p.online && p.afk) return `<span class="pill afk"><span class="dot"></span>AFK</span>`;
  if (p.online) return `<span class="pill online"><span class="dot"></span>Online</span>`;
  return `<span class="pill offline">${esc(ago(p.lastSeen))}</span>`;
}

function stat(label, value, color = "", title = "") {
  return `<div class="stat"${title ? ` title="${esc(title)}"` : ""}><div class="label">${esc(label)}</div><div class="value ${color}">${value}</div></div>`;
}

// ---------------------------------------------------------------- data

const CONFIG = window.SITE_CONFIG || {};
// The plugin writes every 30 s. If the server didn't write for this long, it is off.
const SERVER_STALE_MS = 5 * 60 * 1000;
// Supabase sends at most 1000 rows at once; more players are read in parts.
const PAGE_SIZE = 1000;

/** Reads all rows of one table from Supabase. */
async function table(name) {
  const base = (CONFIG.supabaseUrl || location.origin).replace(/\/+$/, "");
  const headers = { apikey: CONFIG.supabaseKey };
  // Old-style keys (start with "eyJ") must also be sent as Bearer. New sb_publishable_ keys must not.
  if (CONFIG.supabaseKey.startsWith("eyJ")) headers.Authorization = "Bearer " + CONFIG.supabaseKey;
  const rows = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const r = await fetch(`${base}/rest/v1/${name}?select=*&limit=${PAGE_SIZE}&offset=${offset}`, { headers, cache: "no-store" });
    if (!r.ok) {
      const body = await r.text().catch(() => "");
      const error = new Error(`${name}: ${r.status} ${body}`);
      error.missingTables = /PGRST205|42P01|does not exist/.test(body);
      error.badKey = r.status === 401 || r.status === 403;
      throw error;
    }
    const page = await r.json();
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function firstLine(text) {
  return String(text || "").split("\n")[0].trim();
}

/** Turns the Supabase tables into the data the pages use. */
function build({ players, online, servers, clans, clanMembers }) {
  const now = Date.now();
  const server = servers.find(s => s.id === 1);
  const serverUpdated = server ? Number(server.updated_at) : 0;
  const up = !!server && now - serverUpdated < SERVER_STALE_MS;
  const onlineById = new Map(up ? online.map(o => [o.uuid, o]) : []);
  const clanById = new Map(clans.map(c => [c.id, {
    id: c.id, name: c.name, tag: c.tag, color: c.color, owner: c.owner, created: Number(c.created),
  }]));
  const membership = new Map(clanMembers.map(m => [m.uuid, m]));
  return {
    configured: true,
    generatedAt: serverUpdated,
    server: {
      name: CONFIG.serverName || firstLine(server?.motd) || "Minecraft Server",
      address: CONFIG.serverAddress || "",
      motd: server?.motd || "",
      version: server?.version || "",
      maxPlayers: Number(server?.max_players || 0),
      onlineCount: onlineById.size,
      updatedAt: serverUpdated,
      up,
    },
    clans: [...clanById.values()].map(c => ({
      ...c,
      members: clanMembers.filter(m => m.clan_id === c.id).map(m => ({ uuid: m.uuid, role: m.role })),
    })),
    players: players.map(r => {
      const o = onlineById.get(r.uuid);
      const m = membership.get(r.uuid);
      const clan = m ? clanById.get(m.clan_id) : null;
      return {
        uuid: r.uuid,
        name: r.name,
        firstJoin: Number(r.first_join),
        lastSeen: Number(r.last_seen),
        playtime: Number(r.playtime_seconds),
        activeTime: Number(r.active_seconds),
        blocksPlaced: Number(r.blocks_placed),
        blocksBroken: Number(r.blocks_broken),
        deaths: Number(r.deaths),
        mobKills: Number(r.mob_kills),
        playerKills: Number(r.player_kills),
        advancements: Number(r.advancements),
        // Newer columns: 0 if the database doesn't have them yet (schema.sql not run again).
        longestSession: Number(r.longest_session_seconds || 0),
        sessions: Number(r.sessions || 0),
        distance: Number(r.distance_cm || 0),
        fish: Number(r.fish_caught || 0),
        bred: Number(r.animals_bred || 0),
        trades: Number(r.villager_trades || 0),
        crafted: Number(r.items_crafted || 0),
        online: !!o,
        afk: !!o && !!o.afk,
        world: o ? o.world : "",
        clan: clan ? { id: clan.id, name: clan.name, tag: clan.tag, color: clan.color } : null,
        clanRole: clan ? m.role : null,
      };
    }),
  };
}

async function readData() {
  if (!CONFIG.supabaseKey) {
    return { configured: false, server: { name: CONFIG.serverName || "Minecraft Server", address: CONFIG.serverAddress || "" }, players: [], clans: [] };
  }
  const [players, online, servers, clans, clanMembers] = await Promise.all(
    ["players", "online_players", "server_status", "clans", "clan_members"].map(table));
  return build({ players, online, servers, clans, clanMembers });
}

async function load() {
  const live = document.getElementById("live");
  const liveText = document.getElementById("live-text");
  try {
    const data = await readData();
    state.data = data;
    state.players = data.players || [];
    state.clans = data.clans || [];
    const server = data.server || {};
    const name = server.name || "Server-Statistiken";
    document.getElementById("server-name").textContent = name;
    document.title = name;
    if (!data.configured) {
      live.classList.add("offline");
      liveText.textContent = "Nicht eingerichtet";
    } else {
      live.classList.toggle("offline", !server.up);
      liveText.textContent = server.up ? `${server.onlineCount} online` : "Server offline";
    }
    document.getElementById("updated").textContent = data.generatedAt ? "Aktualisiert um " + time(data.generatedAt) : "";
    render(false);
  } catch (e) {
    console.warn("Could not read the stats from Supabase:", e);
    live.classList.add("offline");
    liveText.textContent = "Keine Daten";
    if (!state.data) {
      const why = e.missingTables
        ? "Die Datenbank ist noch nicht eingerichtet (supabase/schema.sql im Supabase SQL Editor ausführen)."
        : e.badKey
          ? "Der Schlüssel der Webseite stimmt nicht (SUPABASE_PUBLISHABLE_KEY prüfen)."
          : "Versuche es in einer Minute nochmal.";
      app.innerHTML = `<div class="card loading">Die Statistiken können gerade nicht geladen werden. ${esc(why)}</div>`;
    }
  }
}

// ---------------------------------------------------------------- pages

function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/");
  return { page: parts[0] || "home", id: parts[1] };
}

function render(navigated = true) {
  if (!state.data) return;
  const { page, id } = route();
  document.querySelectorAll(".tabs a").forEach(a =>
    a.classList.toggle("active", a.dataset.page === (page === "player" ? "players" : page)));
  // On the players page, a refresh only redraws the table, so typing in the search box isn't interrupted.
  if (page === "players" && !navigated && state.page === "players") {
    drawPlayerRows();
    return;
  }
  state.page = page;
  if (page === "players") { app.innerHTML = notices() + playersPage(); drawPlayerRows(); }
  else if (page === "player") app.innerHTML = playerPage(id);
  else if (page === "clans") app.innerHTML = notices() + clansPage();
  else if (page === "info") app.innerHTML = infoPage();
  else app.innerHTML = notices() + homePage();
}

/** Messages for the server owner: not set up yet, or the last update failed. */
function notices() {
  const d = state.data;
  if (!d.configured) {
    return `<div class="notice">Diese Webseite ist noch nicht mit Supabase verbunden. Trage SUPABASE_URL und
      SUPABASE_PUBLISHABLE_KEY als Variablen im GitHub-Repository ein (siehe README.md, "Setup") und starte dann den
      Workflow "Update website".</div>`;
  }
  return "";
}

function board(title, key, show) {
  const top = [...state.players].filter(p => p[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, 5);
  const max = top.length ? top[0][key] : 1;
  const rows = top.map((p, i) => `<li>
      <a href="#/player/${esc(p.uuid)}"><span class="rank">${i + 1}</span>${head(p.uuid, "head sm", 64, p.name)}
        <span class="name">${clanTag(p.clan)}${esc(p.name)}</span><span class="amount">${show(p[key])}</span></a>
      <div class="bar"><span style="width:${Math.max(4, Math.round(p[key] / max * 100))}%"></span></div></li>`).join("");
  return `<section class="card"><h2>${esc(title)}</h2>${rows ? `<ol class="board">${rows}</ol>` : `<p class="empty">Noch niemand.</p>`}</section>`;
}

function homePage() {
  const s = state.data.server || {};
  const players = state.players;
  const online = players.filter(p => p.online).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  const sum = key => players.reduce((total, p) => total + (p[key] || 0), 0);
  const onlineList = online.map(p => `<li><a href="#/player/${esc(p.uuid)}">${head(p.uuid, "head", 64, p.name)}
      <span class="name">${clanTag(p.clan)}${esc(p.name)}</span>
      <span class="meta">${p.afk ? `<span class="pill afk"><span class="dot"></span>AFK</span>` : esc(p.world)}</span></a></li>`).join("");
  const join = s.address ? `<p>Spiel mit: <span class="join">${esc(s.address)}</span></p>` : `<p>Was gerade auf dem Server los ist.</p>`;
  return `
    <div class="page-head"><h1>Übersicht</h1>${join}</div>
    <div class="stats home">
      ${stat("Online", `${s.up ? online.length : 0}<small> / ${s.maxPlayers || 0}</small>`, "green")}
      ${stat("Spieler", num(players.length))}
      ${stat("Clans", num(state.clans.length))}
      ${stat("Gespielte Zeit", units(duration(sum("playtime"))))}
      ${stat("Blöcke gesetzt", num(sum("blocksPlaced")))}
      ${stat("Zurückgelegt", units(distance(sum("distance"))), "", "Zu Fuß, schwimmend, mit Elytra, Boot, Pferd und mehr")}
      ${stat("Mob-Kills", num(sum("mobKills")))}
      ${stat("Tode", num(sum("deaths")), "red")}
    </div>
    <div class="grid">
      <section class="card">
        <h2>Online <span class="hint">${s.up ? "um " + time(s.updatedAt) : "Server offline"}</span></h2>
        ${onlineList ? `<ul class="people">${onlineList}</ul>` : `<p class="empty">${s.up ? "Gerade ist niemand online." : "Der Server ist offline."}</p>`}
      </section>
      ${board("Meiste Spielzeit", "playtime", duration)}
      ${board("Meiste Blöcke platziert", "blocksPlaced", num)}
      ${board("Meiste Blöcke abgebaut", "blocksBroken", num)}
      ${board("Meiste Monster getötet", "mobKills", num)}
      ${board("Meiste Achievements", "advancements", num)}
      ${board("Meiste Strecke gereist", "distance", distance)}
    </div>`;
}

const columns = [
  { key: "name", label: "Spieler", cell: p => `<a href="#/player/${esc(p.uuid)}">${head(p.uuid, "head sm", 64, p.name)}${clanTag(p.clan)}<span class="pname">${esc(p.name)}</span></a>`, text: true },
  { key: "lastSeen", label: "Status", cell: p => statusPill(p), sortValue: p => p.online ? Number.MAX_SAFE_INTEGER - (p.afk ? 1 : 0) : p.lastSeen },
  { key: "playtime", label: "Spielzeit", cell: p => duration(p.playtime), num: true },
  { key: "activeTime", label: "Aktiv", cell: p => duration(p.activeTime), num: true },
  { key: "blocksPlaced", label: "Gesetzt", cell: p => num(p.blocksPlaced), num: true },
  { key: "blocksBroken", label: "Abgebaut", cell: p => num(p.blocksBroken), num: true },
  { key: "mobKills", label: "Mob-Kills", cell: p => num(p.mobKills), num: true },
  { key: "deaths", label: "Tode", cell: p => num(p.deaths), num: true },
  { key: "distance", label: "Strecke", cell: p => distance(p.distance), num: true },
  { key: "advancements", label: "Achievements", cell: p => num(p.advancements), num: true },
];

function playersPage() {
  return `
    <div class="page-head"><h1>Spieler</h1><p>Alle, die schon mal da waren. Klicke auf eine Spalte zum Sortieren.</p></div>
    <section class="card">
      <h2><span id="player-count">Alle Spieler</span>
        <input class="search" id="search" type="search" placeholder="Spieler oder Clans suchen" value="${esc(state.query)}" aria-label="Suchen"></h2>
      <div id="rows"></div>
    </section>`;
}

function drawPlayerRows() {
  const target = document.getElementById("rows");
  if (!target) return;
  const col = columns.find(c => c.key === state.sort.key) || columns[2];
  const value = col.sortValue || (p => col.text ? String(p[col.key]).toLowerCase() : p[col.key]);
  const q = state.query.trim().toLowerCase();
  const list = state.players
    .filter(p => !q || p.name.toLowerCase().includes(q) || (p.clan && (p.clan.name + " " + p.clan.tag).toLowerCase().includes(q)))
    .sort((a, b) => {
      const x = value(a), y = value(b);
      const r = x < y ? -1 : x > y ? 1 : 0;
      return state.sort.desc ? -r : r;
    });
  document.getElementById("player-count").textContent = `${list.length} von ${state.players.length} Spielern`;
  const headers = columns.map(c => `<th class="${c.num ? "num" : ""} ${c.key === state.sort.key ? "sorted" : ""}" data-sort="${c.key}" tabindex="0">
      ${esc(c.label)}${c.key === state.sort.key ? `<span class="arrow">${state.sort.desc ? "▼" : "▲"}</span>` : ""}</th>`).join("");
  const rows = list.map(p => `<tr>${columns.map(c => `<td class="${c.num ? "num" : ""}">${c.cell(p)}</td>`).join("")}</tr>`).join("");
  target.innerHTML = rows
    ? `<div class="table-wrap"><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`
    : `<p class="empty">${state.players.length ? "Kein Spieler passt zu deiner Suche." : "Es war noch niemand da."}</p>`;
}

function playerPage(uuid) {
  const p = state.players.find(x => x.uuid === uuid);
  if (!p) return `<a class="back" href="#/players">← Alle Spieler</a><section class="card"><h2>Spieler nicht gefunden</h2></section>`;
  const afkTime = Math.max(0, p.playtime - p.activeTime);
  return `
    <a class="back" href="#/players">← Alle Spieler</a>
    <section class="card">
      <div class="profile">
        ${head(p.uuid, "head xl", 128, p.name)}
        <div>
          <h1>${esc(p.name)}</h1>
          <div class="sub">
            ${statusPill(p)}
            ${p.clan ? `<a href="#/clans">${clanTag(p.clan)}${esc(p.clan.name)}${p.clanRole && p.clanRole !== "member" ? ` · ${esc(roleName(p.clanRole))}` : ""}</a>` : ""}
            <span>Dabei seit ${esc(date(p.firstJoin))}</span>
            ${p.online && p.world ? `<span>Welt: ${esc(p.world)}</span>` : ""}
          </div>
        </div>
      </div>
    </section>
    <section class="card">
      <h2>Statistiken</h2>
      ${statGroup("Zeit", [
        stat("Spielzeit", units(duration(p.playtime))),
        stat("Aktive Zeit", units(duration(p.activeTime)), "green", "Spielzeit ohne AFK"),
        stat("AFK-Zeit", units(duration(afkTime)), "muted"),
        stat("Längste Sitzung", units(duration(p.longestSession)), "", "Am längsten am Stück online"),
        stat("Logins", num(p.sessions)),
      ])}
      ${statGroup("Bauen & Abbauen", [
        stat("Blöcke gesetzt", num(p.blocksPlaced)),
        stat("Blöcke abgebaut", num(p.blocksBroken)),
        stat("Items gecraftet", num(p.crafted)),
      ])}
      ${statGroup("Kampf", [
        stat("Mob-Kills", num(p.mobKills)),
        stat("Spieler-Kills", num(p.playerKills)),
        stat("Tode", num(p.deaths), "red"),
        stat("Kills pro Tod", esc(killsPerDeath(p)), "", p.deaths ? "Mob- und Spieler-Kills geteilt durch Tode" : "Noch nie gestorben"),
      ])}
      ${statGroup("Abenteuer", [
        stat("Zurückgelegt", units(distance(p.distance)), "", "Zu Fuß, schwimmend, mit Elytra, Boot, Pferd und mehr"),
        stat("Fische gefangen", num(p.fish)),
        stat("Tiere gezüchtet", num(p.bred)),
        stat("Dorfbewohner-Handel", num(p.trades)),
        stat("Achievements", num(p.advancements), "gold"),
      ])}
    </section>`;
}

function statGroup(title, tiles) {
  return `<h3 class="group">${esc(title)}</h3><div class="stats flat">${tiles.join("")}</div>`;
}

const ROLE_ORDER = { owner: 0, officer: 1, member: 2 };
const ROLE_NAMES = { owner: "Besitzer", officer: "Offizier", member: "Mitglied" };
const roleName = role => ROLE_NAMES[role] || role;

function clansPage() {
  const top = `<div class="page-head"><h1>Clans</h1><p>Gründe im Spiel deinen eigenen mit <b>/clan create &lt;Name&gt; &lt;Tag&gt;</b>. Alle Befehle: <a href="#/info">Befehle</a>.</p></div>`;
  if (!state.clans.length) return top + `<section class="card"><p class="empty">Noch keine Clans.</p></section>`;
  const byId = new Map(state.players.map(p => [p.uuid, p]));
  const clans = state.clans.map(c => {
    const members = c.members.map(m => ({ ...m, player: byId.get(m.uuid) })).filter(m => m.player);
    return {
      ...c, members,
      playtime: members.reduce((t, m) => t + m.player.playtime, 0),
      blocks: members.reduce((t, m) => t + m.player.blocksPlaced, 0),
      mobKills: members.reduce((t, m) => t + m.player.mobKills, 0),
      fish: members.reduce((t, m) => t + m.player.fish, 0),
      distance: members.reduce((t, m) => t + m.player.distance, 0),
      online: members.filter(m => m.player.online).length,
    };
  }).sort((a, b) => b.members.length - a.members.length || b.playtime - a.playtime);
  return top + `<div class="grid">${clans.map(c => `
    <section class="card">
      <div class="clan-top">${clanTag(c)}<span class="cname">${esc(c.name)}</span></div>
      <p class="clan-sub">Seit ${esc(date(c.created))}${c.online ? ` · <span class="on">${c.online} online</span>` : ""}</p>
      <div class="clan-figures">
        <div><b>${c.members.length}</b><span>Mitglieder</span></div>
        <div><b>${duration(c.playtime)}</b><span>gespielt</span></div>
        <div><b>${num(c.blocks)}</b><span>Blöcke gesetzt</span></div>
        <div><b>${num(c.mobKills)}</b><span>Mob-Kills</span></div>
        <div><b>${num(c.fish)}</b><span>Fische</span></div>
        <div><b>${distance(c.distance)}</b><span>zurückgelegt</span></div>
      </div>
      <div class="members">${[...c.members].sort((a, b) => (ROLE_ORDER[a.role] ?? 3) - (ROLE_ORDER[b.role] ?? 3) || a.player.name.localeCompare(b.player.name)).map(m => `<a class="member" href="#/player/${esc(m.uuid)}">${head(m.uuid, "head", 64, m.player.name)}
          ${esc(m.player.name)}${m.role !== "member" ? `<span class="role">${esc(roleName(m.role))}</span>` : ""}
          ${m.player.online ? `<span class="dot" title="online"></span>` : ""}</a>`).join("")}</div>
    </section>`).join("")}</div>`;
}

// ---------------------------------------------------------------- info page (commands)

const COMMANDS = [
  { title: "Clans", intro: "Gründe mit Freunden einen Clan. Euer Clan-Tag steht in der Tab-Liste vor eurem Namen, ihr habt einen eigenen Chat und eine gemeinsame Truhe. Geld gibt es keins.", list: [
    ["/clan create <Name> <Tag>", "Gründet einen neuen Clan. Name: 3 bis 16 Zeichen (Buchstaben, Zahlen, _ oder -). Tag: 2 bis 5 Buchstaben oder Zahlen, zum Beispiel BFX.", "Alle"],
    ["/clan invite <Spieler>", "Lädt einen Spieler in deinen Clan ein. Die Einladung gilt 5 Minuten.", "Besitzer, Offiziere"],
    ["/clan accept", "Nimmt eine Clan-Einladung an.", "Alle"],
    ["/clan deny", "Lehnt eine Clan-Einladung ab.", "Alle"],
    ["/cc <Nachricht>", "Clan-Chat: nur die Mitglieder deines Clans sehen die Nachricht.", "Mitglieder"],
    ["/clan chest", "Öffnet die gemeinsame Clan-Truhe. Sie ist so groß wie eine Doppeltruhe (54 Plätze) und alle Mitglieder sehen dieselbe Truhe.", "Mitglieder"],
    ["/clan info [Clan]", "Zeigt die Mitglieder, das Gründungsdatum und ob Friendly Fire an ist. Ohne Namen: dein eigener Clan.", "Alle"],
    ["/clan list", "Zeigt alle Clans auf dem Server.", "Alle"],
    ["/clan leave", "Verlässt deinen Clan. Der Besitzer muss den Clan vorher abgeben oder auflösen.", "Mitglieder"],
    ["/clan kick <Spieler>", "Wirft ein Mitglied aus dem Clan. Offiziere können nur normale Mitglieder rauswerfen.", "Besitzer, Offiziere"],
    ["/clan promote <Spieler>", "Macht ein Mitglied zum Offizier.", "Besitzer"],
    ["/clan demote <Spieler>", "Macht einen Offizier wieder zum normalen Mitglied.", "Besitzer"],
    ["/clan transfer <Spieler>", "Gibt den Clan an ein anderes Mitglied ab. Du wirst dann Offizier.", "Besitzer"],
    ["/clan rename <Name>", "Gibt dem Clan einen neuen Namen.", "Besitzer"],
    ["/clan tag <Tag>", "Ändert den Clan-Tag.", "Besitzer"],
    ["/clan color <Farbe>", "Ändert die Farbe des Clan-Tags. Farben: gold, gelb, rot, dunkelrot, gruen, dunkelgruen, tuerkis, dunkeltuerkis, blau, dunkelblau, pink, lila, weiss, grau, dunkelgrau, schwarz.", "Besitzer"],
    ["/clan friendlyfire on|off", "Ob sich Clan-Mitglieder gegenseitig Schaden machen können. Standard: aus.", "Besitzer, Offiziere"],
    ["/clan disband", "Löst den Clan für alle auf (mit /clan disband confirm bestätigen). Die Clan-Truhe muss dafür leer sein, damit nichts verloren geht.", "Besitzer"],
  ]},
  { title: "Mobs", intro: "Damit dein Haustier, dein Dorfbewohner oder dein Farmtier nicht einfach verschwindet.", list: [
    ["/lockmob", "Schau einen Mob an (bis 6 Blöcke entfernt): er verschwindet nie mehr (despawnt nicht). Sonst ändert sich nichts, er kann weiter Schaden nehmen und sterben.", "Alle"],
    ["/unlockmob", "Schau einen gesperrten Mob an: er kann wieder ganz normal verschwinden. Geht nur bei Mobs, die du selbst gesperrt hast (Admins dürfen alle entsperren).", "Alle"],
  ]},
  { title: "Statistiken", intro: "Alles, was du im Spiel siehst, steht auch hier auf der Webseite.", list: [
    ["/stats", "Zeigt deine Spielzeit (und davon aktive Zeit), längste Sitzung, Logins, gesetzte und abgebaute Blöcke, gecraftete Items, getötete Mobs, Tode, Achievements, zurückgelegte Strecke, gefangene Fische, gezüchtete Tiere und Handel mit Dorfbewohnern. Auch als /playtime.", "Alle"],
    ["/clyro", "Zeigt alle Befehle mit kurzer Erklärung im Chat. Auch als /cl.", "Alle"],
  ]},
  { title: "Admins", intro: "Nur für Admins (Operatoren) des Servers.", list: [
    ["/clanadmin rename <Clan> <Name>", "Benennt jeden Clan um, zum Beispiel bei einem unpassenden Namen.", "Admins"],
    ["/clanadmin tag <Clan> <Tag>", "Ändert den Tag jedes Clans.", "Admins"],
    ["/clanadmin disband <Clan>", "Löst jeden Clan auf.", "Admins"],
    ["/unlockallmobs", "Entsperrt alle gesperrten Mobs in allen Welten (kurz: /unlockall). Mobs in Gebieten, in denen gerade niemand ist, werden entsperrt, sobald jemand in die Nähe kommt.", "Admins"],
  ]},
];

function infoPage() {
  const s = state.data.server || {};
  const sections = COMMANDS.map(group => `
    <section class="card">
      <h2>${esc(group.title)}</h2>
      <p class="info-intro">${esc(group.intro)}</p>
      <dl class="commands">${group.list.map(([cmd, text, who]) => `
        <div class="command"><dt><code>${esc(cmd)}</code><span class="who">${esc(who)}</span></dt><dd>${esc(text)}</dd></div>`).join("")}
      </dl>
    </section>`).join("");
  return `
    <div class="page-head"><h1>Befehle</h1><p>Alle Befehle auf dem Server. Im Spiel zeigt <b>/clyro</b> dieselbe Liste.${s.address ? ` Server-Adresse: <span class="join">${esc(s.address)}</span>` : ""}</p></div>
    <div class="info-grid">${sections}</div>`;
}

// ---------------------------------------------------------------- events

function sortBy(key) {
  state.sort = { key, desc: state.sort.key === key ? !state.sort.desc : key !== "name" };
  drawPlayerRows();
}

app.addEventListener("click", e => {
  const th = e.target.closest("th[data-sort]");
  if (th) sortBy(th.dataset.sort);
});
app.addEventListener("keydown", e => {
  const th = e.target.closest("th[data-sort]");
  if (th && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); sortBy(th.dataset.sort); }
});
app.addEventListener("input", e => {
  if (e.target.id === "search") { state.query = e.target.value; drawPlayerRows(); }
});

window.addEventListener("hashchange", () => { render(true); window.scrollTo(0, 0); });
load();
// The plugin writes every 30 s. Read again every 60 s, but only while the page is visible (less load).
setInterval(() => { if (!document.hidden) load(); }, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
