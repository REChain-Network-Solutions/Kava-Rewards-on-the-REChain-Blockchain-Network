CREATE TABLE IF NOT EXISTS snapshots (
	snapshot_id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
	total_effective_usd_balance DOUBLE NULL,
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- query separator
CREATE INDEX IF NOT EXISTS snapshotsByDate ON snapshots(creation_date);
-- query separator


CREATE TABLE IF NOT EXISTS exchange_rates (
	snapshot_id INTEGER NOT NULL,
	home_asset CHAR(42) NOT NULL,
	home_symbol VARCHAR(20) NOT NULL,
	exchange_rate DOUBLE NOT NULL,
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id)
);
-- query separator
CREATE INDEX IF NOT EXISTS exchangeRatesBySnapshotId ON exchange_rates(snapshot_id);
-- query separator


CREATE TABLE IF NOT EXISTS balances (
	snapshot_id INTEGER NOT NULL,
	address CHAR(32) NOT NULL,
	home_asset CHAR(42) NOT NULL,
	home_symbol VARCHAR(20) NOT NULL,
	balance DOUBLE NOT NULL,
	effective_balance DOUBLE NOT NULL,
	effective_usd_balance DOUBLE NOT NULL,
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (snapshot_id) REFERENCES snapshots(snapshot_id),
	UNIQUE (snapshot_id, address, home_asset)
);

-- query separator
CREATE TABLE IF NOT EXISTS average_balances (
	period CHAR(7) NOT NULL, -- 2023-05
	address CHAR(32) NOT NULL,
	home_asset CHAR(42) NOT NULL,
	home_symbol VARCHAR(20) NOT NULL,
	balance DOUBLE NOT NULL,
	effective_balance DOUBLE NOT NULL,
	effective_usd_balance DOUBLE NOT NULL,
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	PRIMARY KEY (period, address, home_asset)
);

-- query separator
CREATE TABLE IF NOT EXISTS address_types (
	address CHAR(32) NOT NULL UNIQUE,
	type VARCHAR(10) NOT NULL
);

-- query separator
CREATE TABLE IF NOT EXISTS total_rewards (
	period CHAR(7) NOT NULL UNIQUE, -- 2023-05
	total_reward INT NOT NULL, -- in bytes
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	pay_date TIMESTAMP NULL
);


-- query separator
CREATE TABLE IF NOT EXISTS rewards (
	period CHAR(7) NOT NULL, -- 2023-05
	address CHAR(32) NOT NULL,
	share DOUBLE NOT NULL,
	reward INT NOT NULL, -- in bytes
	creation_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	pay_date TIMESTAMP NULL,
	payment_unit CHAR(44) NULL,
	FOREIGN KEY (payment_unit) REFERENCES units(unit),
	UNIQUE(period, address)
);

