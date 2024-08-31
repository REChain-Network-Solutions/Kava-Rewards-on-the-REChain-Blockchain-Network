"use strict";
const path = require('path');
require('dotenv').config({ path: path.dirname(process.mainModule.paths[0]) + '/.env' });

exports.bServeAsHub = false;
exports.bLight = true;
exports.bSingleAddress = true;

exports.bNoPassphrase = false;


exports.hub = process.env.testnet ? 'rechain.network/bb-test' : 'rechain.network/bb';
exports.token_registry_address = "O6H6ZIFI57X3PLTYHOCVYPP5A553CYFQ";

exports.cs_url = process.env.testnet ? 'https://testnet-bridge.counterstake.org/api' : 'https://counterstake.org/api';
exports.explorer_url = process.env.testnet ? 'https://testnetexplorer.rechain.network/api' : 'https://explorer.rechain.network/api';
exports.gecko_terminal_api_url = 'https://api.geckoterminal.com/api/v2';
exports.multichain_usdc_token_address = '0xfA9343C3897324496A05fC75abeD6bAC29f8A40f';

const line_token_address = '0x31f8d38df6514b6cc3C360ACE3a2EFA7496214f6';

// home asset => multiplier, for assets that generate double or triple TVL
exports.multipliers = {
	[line_token_address]: 2, // LINE token
};

exports.line_token_address = line_token_address;
exports.webPort = 5282;

console.log('finished server conf');
