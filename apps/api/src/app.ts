import Fastify from 'fastify';
import {readConfig} from './config.js';
export function createApp(){const app=Fastify({logger:{redact:['req.headers.cookie','req.headers.authorization']},bodyLimit:65536});const config=readConfig();app.get('/health/live',async()=>({ok:true}));app.get('/health/ready',async()=>({ok:true,profile:config.profile,liveHsp:false}));app.get('/api/config',async()=>({profile:config.profile,liveHsp:false,mainnet:false}));return app;}
