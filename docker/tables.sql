-- Empty tables for the Docker test database. Runs once, when the database is created.
-- They are the same tables the plugin creates itself (table prefix "mc_"), so the test website
-- works even before your test Minecraft server has written anything.
-- Made-up demo players: see demo-data.sql. Start fresh with: docker compose down -v

CREATE TABLE IF NOT EXISTS mc_players (
  uuid CHAR(36) NOT NULL PRIMARY KEY, name VARCHAR(32) NOT NULL,
  first_join BIGINT NOT NULL, last_seen BIGINT NOT NULL,
  playtime_seconds BIGINT NOT NULL DEFAULT 0, active_seconds BIGINT NOT NULL DEFAULT 0,
  blocks_placed BIGINT NOT NULL DEFAULT 0, blocks_broken BIGINT NOT NULL DEFAULT 0,
  deaths BIGINT NOT NULL DEFAULT 0, mob_kills BIGINT NOT NULL DEFAULT 0,
  player_kills BIGINT NOT NULL DEFAULT 0, advancements BIGINT NOT NULL DEFAULT 0,
  updated_at BIGINT NOT NULL DEFAULT 0
) CHARACTER SET utf8mb4;
CREATE TABLE IF NOT EXISTS mc_online (
  uuid CHAR(36) NOT NULL PRIMARY KEY, name VARCHAR(32) NOT NULL,
  afk TINYINT NOT NULL DEFAULT 0, world VARCHAR(64) NOT NULL DEFAULT '', updated_at BIGINT NOT NULL DEFAULT 0
) CHARACTER SET utf8mb4;
CREATE TABLE IF NOT EXISTS mc_clans (
  id INT NOT NULL PRIMARY KEY, name VARCHAR(32) NOT NULL, tag VARCHAR(8) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#ffaa00', owner CHAR(36) NOT NULL, created BIGINT NOT NULL,
  member_count INT NOT NULL DEFAULT 0, updated_at BIGINT NOT NULL DEFAULT 0
) CHARACTER SET utf8mb4;
CREATE TABLE IF NOT EXISTS mc_clan_members (
  uuid CHAR(36) NOT NULL PRIMARY KEY, clan_id INT NOT NULL, role VARCHAR(16) NOT NULL
) CHARACTER SET utf8mb4;
CREATE TABLE IF NOT EXISTS mc_server (
  id TINYINT NOT NULL PRIMARY KEY, motd VARCHAR(512) NOT NULL DEFAULT '', version VARCHAR(32) NOT NULL DEFAULT '',
  max_players INT NOT NULL DEFAULT 0, online_count INT NOT NULL DEFAULT 0, updated_at BIGINT NOT NULL DEFAULT 0
) CHARACTER SET utf8mb4;
