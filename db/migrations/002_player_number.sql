-- 002_player_number.sql
-- "Player #N" for a game without a nickname. N counts finished games in the
-- order they arrived (1, 2, 3, ...). It is stored once when the game is saved,
-- so a game keeps its number even if another game is deleted later.

ALTER TABLE game_sessions ADD COLUMN player_number INTEGER;

-- Number the games that already exist, oldest first (rowid breaks ties).
UPDATE game_sessions SET player_number = (
  SELECT COUNT(*) FROM game_sessions AS older
  WHERE older.received_at < game_sessions.received_at
     OR (older.received_at = game_sessions.received_at AND older.rowid <= game_sessions.rowid)
);

CREATE UNIQUE INDEX idx_game_sessions_player_number ON game_sessions (player_number);
