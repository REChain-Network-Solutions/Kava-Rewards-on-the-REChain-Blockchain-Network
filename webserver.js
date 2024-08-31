/*jslint node: true */
"use strict";

const Koa = require('koa');
const KoaRouter = require('koa-router');
const cors = require('@koa/cors');
const bodyParser = require('koa-bodyparser');

const conf = require('ocore/conf.js');
const db = require('ocore/db.js');

const app = new Koa();
const router = new KoaRouter();
app.use(bodyParser());


function setError(ctx, error) {
	ctx.body = {
		status: 'error',
		error: error.toString(),
	};
	console.error('ERROR:', error);
}


router.get('/snapshots/:snapshot_id', async (ctx) => {
	let snapshot_id = ctx.params.snapshot_id ? decodeURIComponent(ctx.params.snapshot_id) : ctx.query.snapshot_id;
	const [snapshot] = (snapshot_id === 'latest')
		? await db.query("SELECT * FROM snapshots ORDER BY snapshot_id DESC LIMIT 1")
		: await db.query("SELECT * FROM snapshots WHERE snapshot_id=?", [snapshot_id]);
	if (!snapshot)
		return setError(ctx, 'no such snapshot ' + snapshot_id);
	const balances = await db.query("SELECT address, home_asset, home_symbol, balance, effective_balance, effective_usd_balance FROM balances WHERE snapshot_id=?", [snapshot.snapshot_id]);
	snapshot.balances = balances;
	ctx.body = {
		status: 'success',
		data: snapshot
	};
});

router.get('/average_balances/:period', async (ctx) => {
	let period = ctx.params.period ? decodeURIComponent(ctx.params.period) : ctx.query.period;
	if (period === 'latest') {
		const [row] = await db.query("SELECT period FROM average_balances ORDER BY rowid DESC LIMIT 1");
		if (!row)
			return setError(ctx, "no average_balances yet");
		period = row.period;
	}
	const average_balances = await db.query("SELECT * FROM average_balances WHERE period=?", [period]);
	if (!average_balances)
		return setError(ctx, 'no average_balances in period ' + period);
	ctx.body = {
		status: 'success',
		data: average_balances
	};
});

router.get('/rewards/:period', async (ctx) => {
	const period = ctx.params.period ? decodeURIComponent(ctx.params.period) : ctx.query.period;
	const [rewards] = (period === 'latest')
		? await db.query("SELECT * FROM total_rewards ORDER BY period DESC LIMIT 1")
		: await db.query("SELECT * FROM total_rewards WHERE period=?", [period]);
	if (!rewards)
		return setError(ctx, 'no such period ' + period);
	rewards.rewards = await db.query("SELECT address, share, reward, pay_date, payment_unit FROM rewards WHERE period=?", [rewards.period]);
	ctx.body = {
		status: 'success',
		data: rewards
	};
});

router.get('/periods', async (ctx) => {
	const rows = await db.query("SELECT * FROM total_rewards ORDER BY period")
	ctx.body = {
		status: 'success',
		data: rows
	};
});

app.use(cors());
app.use(router.routes());

function start() {
	if (conf.webPort)
		app.listen(conf.webPort);
}

exports.start = start;
