const operator = require('aabot/operator.js');
const db_import = require('./db_import.js');
const { recordSnapshot } = require('./snapshot.js');
const rewards = require('./rewards.js');
const webserver = require('./webserver.js');


process.on('unhandledRejection', up => { throw up });


async function start(){
	await db_import.initDB();
	await operator.start();
	webserver.start();
	await recordSnapshot();
	rewards.start();
}

start();


