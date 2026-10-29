import {readConfig} from '../apps/api/src/config.js';
const config=readConfig();
console.log({node:process.version,profile:config.profile,origin:config.origin,liveHsp:'disabled — credentials and payer SDK required',mainnet:'disabled'});
