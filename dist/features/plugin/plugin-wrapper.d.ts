/**
 * Squish Plugin Wrapper - Hook handlers for Claude Code integration
 */
import 'dotenv/config';
import type { PluginContext } from './types.js';
export declare function onInstall(_context: PluginContext): Promise<void>;
export declare function onSessionStart(context: PluginContext): Promise<void>;
export declare function onUserPromptSubmit(context: PluginContext): Promise<void>;
export declare function onPostToolUse(context: PluginContext): Promise<void>;
export declare function onSessionStop(context: PluginContext): Promise<void>;
declare const _default: {
    onInstall: typeof onInstall;
    onSessionStart: typeof onSessionStart;
    onUserPromptSubmit: typeof onUserPromptSubmit;
    onPostToolUse: typeof onPostToolUse;
    onSessionStop: typeof onSessionStop;
};
export default _default;
//# sourceMappingURL=plugin-wrapper.d.ts.map