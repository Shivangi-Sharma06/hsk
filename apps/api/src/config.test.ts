import {expect,it} from 'vitest';
import {readConfig} from './config.js';
it('fails closed for live profiles, mainnet and unsafe origins',()=>{
 expect(readConfig({}).profile).toBe('local');
 for(const env of [{PROVIDER_PROFILE:'hsp'},{ALLOW_MAINNET:'true'},{APP_ORIGIN:'https://app.example/other'},{API_PORT:'-1'}])expect(()=>readConfig(env)).toThrow();
});
