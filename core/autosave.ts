// Autosave functionality placeholder
export function getDefaultAutosaveHook() {
  let config = { enabled: false, messageCount: 10, hooks: [] as string[] };
  return { 
    getMessageCount: () => 0, 
    updateConfig: (opts?: { enabled?: boolean; messageCount?: number; hooks?: string[] }) => {
      if (opts) Object.assign(config, opts);
    }, 
    getConfig: () => ({ ...config }) 
  };
}
export function createAutosaveConfig() {
  return { enabled: false, messageCount: 10, hooks: [] as string[] };
}