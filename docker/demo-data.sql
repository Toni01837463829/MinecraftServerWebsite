-- OPTIONAL made-up demo players and clans, only to look at the website without a Minecraft server.
-- Not loaded automatically. Load them (while "docker compose up" is running) with:
--   Get-Content demo-data.sql | docker compose exec -T db mariadb -uminecraft -ptest123 minecraft
-- Remove them again with: docker compose down -v   (deletes ALL test data, also from your test server)

SET @now = ROUND(UNIX_TIMESTAMP(NOW(3)) * 1000);
SET @day = 86400000;

INSERT INTO mc_players VALUES
  ('11111111-1111-4111-8111-111111111111', 'Baumeisterin', @now - 30*@day, @now,          312000, 268000, 48210, 21004,  41,  930,  3, 61, @now),
  ('22222222-2222-4222-8222-222222222222', 'Steinbrecher', @now - 28*@day, @now,          254000, 231000,  9120, 88310,  67, 1840,  8, 54, @now),
  ('33333333-3333-4333-8333-333333333333', 'Farmerin',     @now - 21*@day, @now,          131000, 102000, 15540,  9020,  12,  210,  0, 33, @now),
  ('44444444-4444-4444-8444-444444444444', 'Nachtwache',   @now - 14*@day, @now - 2*3600000, 98000, 90100,  3020,  7710,  29, 2210, 14, 40, @now),
  ('55555555-5555-4555-8555-555555555555', 'Entdecker',    @now - 9*@day,  @now - 3*@day,  45000,  39000,  1210,  5230,  18,  340,  1, 47, @now),
  ('66666666-6666-4666-8666-666666666666', 'Neuling',      @now - 1*@day,  @now - 5*3600000, 3600,  3100,   140,   420,   4,   12,  0,  6, @now);

INSERT INTO mc_clans VALUES
  (1, 'Baumeister', 'BAU', '#ffaa00', '11111111-1111-4111-8111-111111111111', @now - 25*@day, 3, @now),
  (2, 'Nachtfalken', 'NF', '#5555ff', '44444444-4444-4444-8444-444444444444', @now - 10*@day, 2, @now);

INSERT INTO mc_clan_members VALUES
  ('11111111-1111-4111-8111-111111111111', 1, 'owner'),
  ('22222222-2222-4222-8222-222222222222', 1, 'officer'),
  ('33333333-3333-4333-8333-333333333333', 1, 'member'),
  ('44444444-4444-4444-8444-444444444444', 2, 'owner'),
  ('55555555-5555-4555-8555-555555555555', 2, 'member');

INSERT INTO mc_online VALUES
  ('11111111-1111-4111-8111-111111111111', 'Baumeisterin', 0, 'world', @now),
  ('22222222-2222-4222-8222-222222222222', 'Steinbrecher', 0, 'world_nether', @now),
  ('33333333-3333-4333-8333-333333333333', 'Farmerin', 1, 'world', @now);

INSERT INTO mc_server VALUES (1, 'Testserver (Docker)', '26.3', 20, 3, @now);

-- Keeps the demo server "online" (the real plugin writes every 30 seconds).
-- It stops as soon as a real Minecraft server writes here, because that changes the motd.
CREATE EVENT IF NOT EXISTS demo_server_heartbeat ON SCHEDULE EVERY 30 SECOND DO
  UPDATE mc_server SET updated_at = ROUND(UNIX_TIMESTAMP(NOW(3)) * 1000)
  WHERE id = 1 AND motd = 'Testserver (Docker)';
