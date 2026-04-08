// TOON compression placeholder
export function compressForContext(content: string): string {
  return content;
}
export function decompressFromContext(content: string): string {
  return content;
}
export function estimateCompressionRatio(content: string): number {
  return 0;
}
export function isJson(content: string): boolean {
  try { JSON.parse(content); return true; } catch { return false; }
}
export function isToon(content: string): boolean {
  return content.startsWith('{') && content.endsWith('}');
}