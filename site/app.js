// Stats website. Reads data/stats.json (made by GitHub Actions from the database every few minutes)
// and draws the page for the current #route. No passwords or database access here: this file only
// reads the finished JSON file.
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
  if (h >= 48) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function ago(millis) {
  const s = Math.max(0, (Date.now() - millis) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const d = Math.floor(s / 86400);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

function date(millis) {
  return new Date(millis).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function time(millis) {
  return new Date(millis).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function num(n) {
  return Number(n || 0).toLocaleString();
}

// A blocky 8x8 face, shown when mc-heads.net can't be reached.
const FALLBACK_HEAD = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" shape-rendering="crispEdges">' +
  '<rect width="8" height="8" fill="#b4846a"/><rect width="8" height="2" fill="#2f1f0f"/>' +
  '<rect y="2" width="1" height="1" fill="#2f1f0f"/><rect x="7" y="2" width="1" height="1" fill="#2f1f0f"/>' +
  '<rect x="1" y="4" width="2" height="1" fill="#fff"/><rect x="2" y="4" width="1" height="1" fill="#4a3a8c"/>' +
  '<rect x="5" y="4" width="2" height="1" fill="#fff"/><rect x="5" y="4" width="1" height="1" fill="#4a3a8c"/>' +
  '<rect x="3" y="5" width="2" height="1" fill="#8c5a40"/><rect x="2" y="6" width="4" height="1" fill="#6a4030"/></svg>');

function head(uuid, cls = "head", size = 64) {
  // Player faces come from mc-heads.net. If it can't be reached, a simple face shows instead.
  return `<img class="${cls}" src="https://mc-heads.net/avatar/${esc(uuid)}/${size}" alt="" loading="lazy"
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

function stat(label, value, color = "") {
  return `<div class="stat"><div class="label">${esc(label)}</div><div class="value ${color}">${value}</div></div>`;
}

// ---------------------------------------------------------------- data

async function load() {
  const live = document.getElementById("live");
  const liveText = document.getElementById("live-text");
  try {
    const r = await fetch("data/stats.json?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("stats.json " + r.status);
    const data = await r.json();
    state.data = data;
    state.players = data.players || [];
    state.clans = data.clans || [];
    const server = data.server || {};
    const name = server.name || "Server Stats";
    document.getElementById("server-name").textContent = name;
    document.title = name;
    if (!data.configured) {
      live.classList.add("offline");
      liveText.textContent = "Not set up";
    } else {
      live.classList.toggle("offline", !server.up);
      liveText.textContent = server.up ? `${server.onlineCount} online` : "Server offline";
    }
    document.getElementById("updated").textContent = data.generatedAt ? "Updated " + time(data.generatedAt) : "";
    render(false);
  } catch (e) {
    live.classList.add("offline");
    liveText.textContent = "No data";
    if (!state.data) app.innerHTML = `<div class="card loading">The stats can't be loaded right now. Try again in a minute.</div>`;
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
  else app.innerHTML = notices() + homePage();
}

/** Messages for the server owner: not set up yet, or the last update failed. */
function notices() {
  const d = state.data;
  if (!d.configured) {
    return `<div class="notice">This website isn't connected to the database yet. Add the database secrets in the
      GitHub repository (see README.md, "Setup"), then run the "Update website" workflow.</div>`;
  }
  if (d.error) {
    return `<div class="notice">The last update couldn't read the database, so these numbers may be old.
      (${esc(d.error)})</div>`;
  }
  return "";
}

function board(title, key, show) {
  const top = [...state.players].filter(p => p[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, 5);
  const max = top.length ? top[0][key] : 1;
  const rows = top.map((p, i) => `<li>
      <a href="#/player/${esc(p.uuid)}"><span class="rank">${i + 1}</span>${head(p.uuid, "head sm")}
        <span class="name">${clanTag(p.clan)}${esc(p.name)}</span><span class="amount">${show(p[key])}</span></a>
      <div class="bar"><span style="width:${Math.max(4, Math.round(p[key] / max * 100))}%"></span></div></li>`).join("");
  return `<section class="card"><h2>${esc(title)}</h2>${rows ? `<ol class="board">${rows}</ol>` : `<p class="empty">Nobody yet.</p>`}</section>`;
}

function homePage() {
  const s = state.data.server || {};
  const players = state.players;
  const online = players.filter(p => p.online).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
  const sum = key => players.reduce((total, p) => total + (p[key] || 0), 0);
  const onlineList = online.map(p => `<li><a href="#/player/${esc(p.uuid)}">${head(p.uuid)}
      <span class="name">${clanTag(p.clan)}${esc(p.name)}</span>
      <span class="meta">${p.afk ? `<span class="pill afk"><span class="dot"></span>AFK</span>` : esc(p.world)}</span></a></li>`).join("");
  const join = s.address ? `<p>Join us: <span class="join">${esc(s.address)}</span></p>` : `<p>What's happening on the server.</p>`;
  return `
    <div class="page-head"><h1>Overview</h1>${join}</div>
    <div class="stats">
      ${stat("Online", `${s.up ? online.length : 0}<small> / ${s.maxPlayers || 0}</small>`, "green")}
      ${stat("Players", num(players.length))}
      ${stat("Clans", num(state.clans.length))}
      ${stat("Time played", duration(sum("playtime")))}
      ${stat("Blocks placed", num(sum("blocksPlaced")))}
      ${stat("Deaths", num(sum("deaths")), "red")}
    </div>
    <div class="grid">
      <section class="card">
        <h2>Online <span class="hint">${s.up ? "at " + time(s.updatedAt) : "server offline"}</span></h2>
        ${onlineList ? `<ul class="people">${onlineList}</ul>` : `<p class="empty">${s.up ? "Nobody is online right now." : "The server is offline."}</p>`}
      </section>
      ${board("Most playtime", "playtime", duration)}
      ${board("Top builders", "blocksPlaced", num)}
      ${board("Top miners", "blocksBroken", num)}
      ${board("Monster hunters", "mobKills", num)}
      ${board("Most advancements", "advancements", num)}
    </div>`;
}

const columns = [
  { key: "name", label: "Player", cell: p => `<a href="#/player/${esc(p.uuid)}">${head(p.uuid, "head sm")}${clanTag(p.clan)}<span class="pname">${esc(p.name)}</span></a>`, text: true },
  { key: "lastSeen", label: "Status", cell: p => statusPill(p), sortValue: p => p.online ? Number.MAX_SAFE_INTEGER - (p.afk ? 1 : 0) : p.lastSeen },
  { key: "playtime", label: "Playtime", cell: p => duration(p.playtime), num: true },
  { key: "activeTime", label: "Active", cell: p => duration(p.activeTime), num: true },
  { key: "blocksPlaced", label: "Placed", cell: p => num(p.blocksPlaced), num: true },
  { key: "blocksBroken", label: "Broken", cell: p => num(p.blocksBroken), num: true },
  { key: "mobKills", label: "Mob kills", cell: p => num(p.mobKills), num: true },
  { key: "deaths", label: "Deaths", cell: p => num(p.deaths), num: true },
  { key: "advancements", label: "Advancements", cell: p => num(p.advancements), num: true },
];

function playersPage() {
  return `
    <div class="page-head"><h1>Players</h1><p>Everyone who has joined. Click a column to sort.</p></div>
    <section class="card">
      <h2><span id="player-count">All players</span>
        <input class="search" id="search" type="search" placeholder="Search players or clans" value="${esc(state.query)}" aria-label="Search"></h2>
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
  document.getElementById("player-count").textContent = `${list.length} of ${state.players.length} players`;
  const headers = columns.map(c => `<th class="${c.num ? "num" : ""} ${c.key === state.sort.key ? "sorted" : ""}" data-sort="${c.key}" tabindex="0">
      ${esc(c.label)}${c.key === state.sort.key ? `<span class="arrow">${state.sort.desc ? "▼" : "▲"}</span>` : ""}</th>`).join("");
  const rows = list.map(p => `<tr>${columns.map(c => `<td class="${c.num ? "num" : ""}">${c.cell(p)}</td>`).join("")}</tr>`).join("");
  target.innerHTML = rows
    ? `<div class="table-wrap"><table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table></div>`
    : `<p class="empty">${state.players.length ? "No player matches your search." : "Nobody has joined yet."}</p>`;
}

function playerPage(uuid) {
  const p = state.players.find(x => x.uuid === uuid);
  if (!p) return `<a class="back" href="#/players">← All players</a><section class="card"><h2>Player not found</h2></section>`;
  const afkTime = Math.max(0, p.playtime - p.activeTime);
  return `
    <a class="back" href="#/players">← All players</a>
    <section class="card">
      <div class="profile">
        ${head(p.uuid, "head xl", 128)}
        <div>
          <h1>${esc(p.name)}</h1>
          <div class="sub">
            ${statusPill(p)}
            ${p.clan ? `<a href="#/clans">${clanTag(p.clan)}${esc(p.clan.name)}${p.clanRole && p.clanRole !== "member" ? ` · ${esc(p.clanRole)}` : ""}</a>` : ""}
            <span>Joined ${esc(date(p.firstJoin))}</span>
          </div>
        </div>
      </div>
    </section>
    <div class="split">
      <section class="card">
        <h2>Stats</h2>
        <div class="stats flat">
          ${stat("Playtime", duration(p.playtime))}
          ${stat("Active time", duration(p.activeTime), "green")}
          ${stat("Blocks placed", num(p.blocksPlaced))}
          ${stat("Blocks broken", num(p.blocksBroken))}
          ${stat("Mob kills", num(p.mobKills))}
          ${stat("Player kills", num(p.playerKills))}
          ${stat("Deaths", num(p.deaths), "red")}
          ${stat("Advancements", num(p.advancements))}
        </div>
      </section>
      <section class="card">
        <h2>Details</h2>
        <ul class="facts">
          <li><span>First joined</span><span class="v">${esc(date(p.firstJoin))}</span></li>
          <li><span>Last seen</span><span class="v">${p.online ? "now" : esc(ago(p.lastSeen))}</span></li>
          <li><span>AFK time</span><span class="v">${duration(afkTime)}</span></li>
          ${p.online && p.world ? `<li><span>World</span><span class="v">${esc(p.world)}</span></li>` : ""}
        </ul>
      </section>
    </div>`;
}

const ROLE_ORDER = { owner: 0, officer: 1, member: 2 };

function clansPage() {
  const top = `<div class="page-head"><h1>Clans</h1><p>Make your own in game with <b>/clan create &lt;name&gt; &lt;tag&gt;</b>.</p></div>`;
  if (!state.clans.length) return top + `<section class="card"><p class="empty">No clans yet.</p></section>`;
  const byId = new Map(state.players.map(p => [p.uuid, p]));
  const clans = state.clans.map(c => {
    const members = c.members.map(m => ({ ...m, player: byId.get(m.uuid) })).filter(m => m.player);
    return {
      ...c, members,
      playtime: members.reduce((t, m) => t + m.player.playtime, 0),
      blocks: members.reduce((t, m) => t + m.player.blocksPlaced, 0),
      online: members.filter(m => m.player.online).length,
    };
  }).sort((a, b) => b.members.length - a.members.length || b.playtime - a.playtime);
  return top + `<div class="grid">${clans.map(c => `
    <section class="card">
      <div class="clan-top">${clanTag(c)}<span class="cname">${esc(c.name)}</span></div>
      <p class="clan-sub">Since ${esc(date(c.created))}</p>
      <div class="clan-figures">
        <div><b>${c.members.length}</b><span>members</span></div>
        <div><b>${c.online}</b><span>online</span></div>
        <div><b>${duration(c.playtime)}</b><span>played</span></div>
        <div><b>${num(c.blocks)}</b><span>blocks placed</span></div>
      </div>
      <div class="members">${[...c.members].sort((a, b) => (ROLE_ORDER[a.role] ?? 3) - (ROLE_ORDER[b.role] ?? 3) || a.player.name.localeCompare(b.player.name)).map(m => `<a class="member" href="#/player/${esc(m.uuid)}">${head(m.uuid)}
          ${esc(m.player.name)}${m.role !== "member" ? `<span class="role">${esc(m.role)}</span>` : ""}
          ${m.player.online ? `<span class="dot" title="online"></span>` : ""}</a>`).join("")}</div>
    </section>`).join("")}</div>`;
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
// The file changes about every 10 minutes; check for a new one every 2 minutes.
setInterval(load, 120000);
