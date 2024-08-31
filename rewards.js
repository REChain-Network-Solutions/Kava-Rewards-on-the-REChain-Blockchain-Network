const db = require('ocore/db.js');
const eventBus = require('ocore/event_bus');
const headlessWallet = require('headless-rechain');
const operator = require('aabot/operator.js');



async function insertRewards(period, total_reward) {
	const [year, month] = period.split('-');
	let end_year = +year;
	let end_month = +month + 1;
	if (end_month > 12) {
		end_month = 1;
		end_year++;
	}
	end_month = end_month + '';
	if (end_month.length === 1)
		end_month = '0' + end_month;
	const from_day = `${period}-01`;
	const to_day = `${end_year}-${end_month}-01`;
	console.log({ from_day, to_day });
	let rewards_rows = [];
	const [{ cumulative_total_balance }] = await db.query(
		`SELECT SUM(total_effective_usd_balance) AS cumulative_total_balance 
		FROM snapshots
		WHERE snapshots.creation_date>=? AND snapshots.creation_date<?`, [from_day, to_day]);
	const rows = await db.query(
		`SELECT address, SUM(effective_usd_balance) AS cumulative_balance 
		FROM snapshots LEFT JOIN balances USING(snapshot_id)
		WHERE snapshots.creation_date>=? AND snapshots.creation_date<?
		GROUP BY address`, [from_day, to_day]);
	for (const { address, cumulative_balance } of rows) {
		const share = cumulative_balance / cumulative_total_balance;
		const reward = Math.floor(share * total_reward);
		rewards_rows.push(`(${db.escape(period)}, ${db.escape(address)}, ${share}, ${reward})`);
	}
	await db.query(`INSERT INTO rewards (period, address, share, reward) VALUES ` + rewards_rows.join(', '));
	await payRewardsForPeriod(period);
}


async function payRewardsForPeriod(period) {
	const outputs = await db.query("SELECT address, reward AS amount FROM rewards WHERE period=? AND pay_date IS NULL LIMIT 100", [period]);
	if (outputs.length === 0) {
		console.log(`period ${period} fully paid`);
		await db.query(`UPDATE total_rewards SET pay_date=${db.getNow()} WHERE period=? AND pay_date IS NULL`, [period]);
		return;
	}
	try {
		const addresses = outputs.map(o => o.address);
		const { unit } = await headlessWallet.sendMultiPayment({
			base_outputs: outputs,
			paying_addresses: [operator.getAddress()],
			spend_unconfirmed: 'all'
		});
		console.log(`sent payment for ${period} in ${unit} to`, addresses);
		await db.query(`UPDATE rewards SET pay_date=${db.getNow()}, payment_unit=? WHERE period=? AND address IN(?)`, [unit, period, addresses]);
		payRewardsForPeriod(period); // next batch
	}
	catch (e) {
		console.log(`sending payment for ${period} failed`, e);
	}
}

async function payRewards() {
	console.log(`starting payRewards`)
	const rows = await db.query("SELECT period FROM total_rewards WHERE pay_date IS NULL ORDER BY period");
	for (const { period } of rows)
		await payRewardsForPeriod(period);
	console.log(`done payRewards`, rows.length);
}



async function start() {

	eventBus.on('text', async (from_address, text) => {
		text = text.trim();

		const device = require('ocore/device.js');
		const sendResponse = response => device.sendMessageToDevice(from_address, 'text', response);
		
		if (!headlessWallet.isControlAddress(from_address))
			return sendResponse("This bot can be managed only from control addresses.  If you are the owner, add your device address to the list of control addresses in conf.js or conf.json.");
		
		let arrMatches = text.match(/^reward (\d\d\d\d-\d\d) ([\d.]+)/i);
		if (arrMatches) {
			const period = arrMatches[1];
			const gb_amount = arrMatches[2];
			const amount = Math.round(gb_amount * 1e9);
			const [year, month] = period.split('-');
			if (+year < 2023)
				throw Error(`bad year`);
			if (+month === 0 || +month > 12)
				throw Error(`bad month`);
			const [row] = await db.query("SELECT * FROM total_rewards WHERE period=?", [period]);
			if (row)
				return sendResponse(`The reward for the period ${period} is already set to ${row.total_reward / 1e9} GB`);
			await db.query("INSERT OR IGNORE INTO total_rewards (period, total_reward) VALUES (?,?)", [period, amount]);
			sendResponse(`${period} reward set to ${amount / 1e9} GB`);
			insertRewards(period, amount);
			return;
		}
		sendResponse(`Unrecognized command`);
	});

	headlessWallet.setupChatEventHandlers();
	setInterval(payRewards, 1000 * 3600);
	payRewards();
}

exports.start = start;
