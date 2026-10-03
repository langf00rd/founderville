-- Suggested Postgres schema for the live leaderboard.
CREATE TABLE players (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE runs (
  id            TEXT PRIMARY KEY,               -- game id from the client (g_<seed>_<ts>)
  player_id     UUID REFERENCES players(id),
  founder       TEXT NOT NULL,                  -- display name at time of run
  product_id    TEXT NOT NULL,
  product_name  TEXT NOT NULL,
  days          INTEGER NOT NULL CHECK (days > 0),   -- in-game days to first paying customer (primary metric)
  real_ms       BIGINT NOT NULL CHECK (real_ms >= 0),-- active play time (tie-breaker)
  actions       INTEGER NOT NULL DEFAULT 0,
  ad_spend      INTEGER NOT NULL DEFAULT 0,
  badge         TEXT NOT NULL,                  -- gold | silver | bronze | iron
  seed          BIGINT NOT NULL,
  customer_seg  TEXT,
  channel       TEXT,
  action_log    JSONB,                          -- optional: for server-side replay verification
  verified      BOOLEAN NOT NULL DEFAULT false,
  finished_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX runs_rank_idx ON runs (days ASC, real_ms ASC);
CREATE INDEX runs_product_rank_idx ON runs (product_id, days ASC, real_ms ASC);

-- Leaderboard query:
-- SELECT * FROM runs WHERE ($1::text IS NULL OR product_id = $1) ORDER BY days, real_ms LIMIT 50;
