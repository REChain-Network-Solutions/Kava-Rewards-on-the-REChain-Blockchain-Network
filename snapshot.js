const axios = require("axios");
const conf = require('ocore/conf.js');
const mutex = require('ocore/mutex.js');
const db = require('ocore/db.js');
const network = require('ocore/network.js');
const dag = require('aabot/dag.js');

const chain = 'kava';
let addressTypes = {};



function wait(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomTimeout(min, max) {
	return Math.round(min * 60 * 1000 + (max - min) * 60 * 1000 * Math.random());
}

async function getUrlWithRetries(url) {
	let r = 0;
	while (true) {
		try {
			return await axios.get(url);
		}
		catch (e) {
			console.log(`attempt ${r} getting ${url} failed`, e);
			if (r > 5 || e.response && e.response.status === 404)
				throw e;
			await wait(30_000);
			r++;
		}
	}
}

async function getBridges() {
	const { data } = await getUrlWithRetries(`${conf.cs_url}/bridges`);
	return data.data;
}

async function getEligibleAssets() {
	let assets = {};
	const bridges = await getBridges();
	for (const { home_network, foreign_network, home_asset, foreign_asset, home_asset_decimals, foreign_asset_decimals, home_symbol, foreign_symbol } of bridges) {
		if (home_network === 'Kava' && foreign_network === 'REChain')
			assets[foreign_asset] = { home_asset, foreign_asset, home_asset_decimals, foreign_asset_decimals, home_symbol, foreign_symbol };
	}
	return assets;
}


async function fetchExchangeRate(token_address, foreign_asset, foreign_symbol) {
	if (foreign_symbol === 'LINE')
		return await getPriceViaGeckoTerminal(conf.line_token_address);
	if (token_address === conf.multichain_usdc_token_address) // Multichain USDC (depegged)
		return await getPriceViaGeckoTerminal(token_address);
	const url = token_address === '0x0000000000000000000000000000000000000000'
		? `https://api.coingecko.com/api/v3/coins/kava`
		: `https://api.coingecko.com/api/v3/coins/${chain}/contract/${token_address.toLowerCase()}`;
	try {
		const { data } = await getUrlWithRetries(url);
		const prices = data.market_data.current_price;
		if (!prices.usd)
			console.log(`no price for token ${token_address}`);
		return prices.usd || 0;
	}
	catch (e) {
		console.log('fetchERC20ExchangeRate error response', e.response);
		if (e.response && e.response.status === 404) {
			console.log(`token ${token_address} not known, assuming 0 price`);
			return 0;
		}
		else
			throw e;
	}
}

function getREChainAssetPrice(asset) {
	const price = network.exchangeRates[asset + '_USD'];
	if (!price)
		throw Error(`no price of ${asset}`);
	return price;
}

async function getPriceViaGeckoTerminal(token_address) {
	/*	
	const { data } = await getUrlWithRetries(`https://api.coingecko.com/api/v3/coins/usd-coin/tickers?exchange_ids=equilibre&order=volume_desc`);
	for (let { coin_id, target_coin_id, last } of data.tickers) {
		if (coin_id === 'axlusdc' && target_coin_id === 'usd-coin')
			return 1 / last;
	}
	throw Error(`axlUSDC-multiUSDC pair not found`);
	*/
	const { data } = await getUrlWithRetries(`${conf.gecko_terminal_api_url}/simple/networks/kava/token_price/${token_address}`);
	const price = +data.data.attributes.token_prices[token_address.toLowerCase()];

	if (token_address === conf.multichain_usdc_token_address) {
		console.log('multiUSDC price', price);
	} else if (token_address === conf.line_token_address) {
		console.log('LINE price', price);
	}
	
	return price;
}

async function getHolders(asset, offset = 0) {
	const { data } = await getUrlWithRetries(`${conf.explorer_url}/asset/${encodeURIComponent(asset)}/next_page_holders?offset=${offset}`);
	return data.end ? data.holders : data.holders.concat(await getHolders(asset, offset + 100));
}

async function getAddressType(address, conn = db) {
	let type = addressTypes[address];
	if (type)
		return type;
	const [row] = await conn.query("SELECT type FROM address_types WHERE address=?", [address]);
	if (row) {
		addressTypes[address] = row.type;
		return row.type;
	}
	const definition = await dag.readAADefinition(address);
	type = definition && definition[0] === 'autonomous agent' ? 'aa' : 'key';
	await conn.query("INSERT OR IGNORE INTO address_types (address, type) VALUES (?, ?)", [address, type]);
	addressTypes[address] = type;
	return type;
}

async function getNextSnapshotId() {
	const [row] = await db.query("SELECT snapshot_id FROM snapshots ORDER BY snapshot_id DESC LIMIT 1");
	return row ? row.snapshot_id + 1 : 1;
}

function getCurrentPeriod() {
	return new Date().toISOString().substring(0, 7);
}

async function recordSnapshot() {
	const unlock = await mutex.lock('recordSnapshot');
	console.log(`starting recordSnapshot`);
	let total_effective_usd_balance = 0;
	let exchange_rates_rows = [];
	let balances_rows = [];
	try {
		const assets = await getEligibleAssets();
		const snapshot_id = await getNextSnapshotId();
		for (const asset in assets) { // asset is foreign_asset
			const { home_asset, home_asset_decimals, foreign_asset_decimals, home_symbol, foreign_symbol } = assets[asset];
			const multiplier = conf.multipliers[home_asset] || 1;
			const price = await fetchExchangeRate(home_asset, asset, foreign_symbol);
			exchange_rates_rows.push(`(${snapshot_id}, ${db.escape(home_asset)}, ${db.escape(home_symbol)}, ${+price})`);
			const holders = await getHolders(asset);
			for (let { address, balance } of holders) {
				const type = await getAddressType(address, conn);
				if (type === 'aa') {
					console.log(`skipping address ${address} as it is an AA`);
					continue;
				}
				if (foreign_symbol === 'LINE' && address === 'KUNNTFAD3G55IWXSNKTDRKH222E4DF7R') {
					console.log(`skipping CS assistant on LINE`);
					continue;
				}
				balance /= 10 ** foreign_asset_decimals;
				const effective_balance = balance * multiplier;
				const effective_usd_balance = effective_balance * price;
				total_effective_usd_balance += effective_usd_balance;
				balances_rows.push(`(${snapshot_id}, ${db.escape(address)}, ${db.escape(home_asset)}, ${db.escape(home_symbol)}, ${balance}, ${effective_balance}, ${effective_usd_balance})`);
			}
		}
		console.error(exchange_rates_rows)
		console.error(balances_rows)
		var conn = await db.takeConnectionFromPool();
		await conn.query("BEGIN");
		await conn.query("INSERT INTO snapshots (snapshot_id, total_effective_usd_balance) VALUES (?,?)", [snapshot_id, total_effective_usd_balance]);
		await conn.query(`INSERT INTO exchange_rates (snapshot_id, home_asset, home_symbol, exchange_rate) VALUES ` + exchange_rates_rows.join(', '));
		await conn.query(`INSERT INTO balances (snapshot_id, address, home_asset, home_symbol, balance, effective_balance, effective_usd_balance) VALUES ` + balances_rows.join(', '));

		const period = getCurrentPeriod();
		const first_day = period + '-01';
		const [{ count_snapshots }] = await conn.query(`SELECT COUNT(*) AS count_snapshots FROM snapshots WHERE creation_date>=?`, [first_day]);
		const [{ first_snapshot_id }] = await conn.query(`SELECT snapshot_id AS first_snapshot_id FROM snapshots WHERE creation_date>=? ORDER BY creation_date LIMIT 1`, [first_day]);
		await conn.query(`REPLACE INTO average_balances 
			(period, address, home_asset, home_symbol, balance, effective_balance, effective_usd_balance)
			SELECT ?, address, home_asset, home_symbol, SUM(balance)/?, SUM(effective_balance)/?, SUM(effective_usd_balance)/?
			FROM balances
			WHERE snapshot_id>=?
			GROUP BY address, home_asset`,
			[period, count_snapshots, count_snapshots, count_snapshots, first_snapshot_id]
		);

		await conn.query("COMMIT");
		setTimeout(recordSnapshot, getRandomTimeout(0, 60));
		console.log(`done recordSnapshot`);
	}
	catch (e) {
		console.log(`recordSnapshot failed`, e);
		if (conn)
			await conn.query("ROLLBACK");
		setTimeout(recordSnapshot, getRandomTimeout(5, 10));
	}
	finally {
		if (conn)
			conn.release();
		unlock();
	}
}

exports.recordSnapshot = recordSnapshot;
