import {defineConfig} from 'vitest/config';
export default defineConfig({test:{include:['apps/**/*.test.ts','packages/**/*.test.ts','tests/**/*.test.ts'],testTimeout:15000,pool:'forks',maxWorkers:2}});
