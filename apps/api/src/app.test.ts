import {expect,it} from 'vitest';
import {createApp} from './app.js';
it('reports simulator readiness honestly',async()=>{const app=createApp();const r=await app.inject('/health/ready');expect(r.statusCode).toBe(200);expect(r.json()).toMatchObject({profile:'local',liveHsp:false});await app.close();});
