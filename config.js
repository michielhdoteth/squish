// Re-export from config.ts - needed because imports use .js extension
export * from './config.ts';
export { config, getDataDir } from './config.ts';
import config from './config.ts';
export default config;