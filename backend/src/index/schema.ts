/** Derived tables. Every row is replayable from Arc logs. */
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS indexer_cursor (
  id integer PRIMARY KEY CHECK (id = 1),
  last_block bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS roots (
  address text PRIMARY KEY,
  registrar text NOT NULL,
  verifying_key text NOT NULL,
  max_exposure text NOT NULL,
  created_block bigint NOT NULL,
  created_tx text NOT NULL,
  created_log_index integer NOT NULL
);

CREATE TABLE IF NOT EXISTS capabilities (
  tab text PRIMARY KEY,
  root text NOT NULL,
  agent text NOT NULL,
  cap text NOT NULL,
  expiry text NOT NULL,
  opened_block bigint NOT NULL,
  opened_tx text NOT NULL,
  opened_log_index integer NOT NULL,
  opened_at text NOT NULL DEFAULT '',
  close_block bigint,
  close_tx text,
  close_log_index integer,
  cap_released text,
  swept boolean,
  permissionless boolean
);

CREATE TABLE IF NOT EXISTS activity (
  tx_hash text NOT NULL,
  log_index integer NOT NULL,
  block_number bigint NOT NULL,
  observed_at text NOT NULL,
  root text NOT NULL,
  kind text NOT NULL,
  tab text,
  agent text,
  payee text,
  amount text,
  permissionless boolean,
  swept boolean,
  PRIMARY KEY (tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS activity_root ON activity (root, block_number, log_index);
CREATE INDEX IF NOT EXISTS capabilities_root ON capabilities (root);
`;
