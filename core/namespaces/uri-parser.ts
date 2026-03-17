/** URI Parser for Squish namespace scheme (squish://) */

export interface SquishURIParsed {
  type: 'namespace';
  projectId: string;
  namespacePath: string[];
  memoryId?: string;
}

/**
 * Parse a squish:// URI into components
 * @example parseSquishURI('squish://my-project/user/preferences') -> { type: 'namespace', projectId: 'my-project', namespacePath: ['user', 'preferences'] }
 */
export function parseSquishURI(uri: string): SquishURIParsed | null {
  if (!uri || typeof uri !== 'string') {
    return null;
  }

  // Match squish://project/path/to/memory
  const match = uri.match(/^squish:\/\/([^\/]+)\/(.*)$/);

  if (!match) {
    return null;
  }

  const [, projectId, pathPart] = match;
  const namespacePath = pathPart ? pathPart.split('/').filter(Boolean) : [];

  // If path ends with a UUID, it's a memory ID
  const lastSegment = namespacePath[namespacePath.length - 1];
  let memoryId: string | undefined;

  if (lastSegment && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(lastSegment)) {
    memoryId = lastSegment;
    namespacePath.pop();
  }

  return {
    type: 'namespace',
    projectId,
    namespacePath,
    memoryId,
  };
}

/**
 * Build a squish:// URI from components
 * @example buildSquishURI('my-project', ['user', 'preferences']) -> 'squish://my-project/user/preferences'
 */
export function buildSquishURI(
  projectId: string,
  path: string[],
  memoryId?: string
): string {
  if (!projectId) {
    throw new Error('Project ID is required');
  }

  const cleanPath = path.filter(Boolean);
  const basePath = `squish://${projectId}${cleanPath.length > 0 ? '/' + cleanPath.join('/') : ''}`;

  return memoryId ? `${basePath}/${memoryId}` : basePath;
}

/**
 * Validate a namespace path (no "..", no empty segments)
 */
export function validateNamespacePath(path: string[]): boolean {
  if (path.length === 0) return true;

  for (const segment of path) {
    if (!segment || segment.length === 0) {
      return false;
    }
    if (segment.includes('..')) {
      return false;
    }
  }

  return true;
}

/**
 * Get parent namespace path
 * @example getParentPath(['user', 'preferences', 'coding']) -> ['user', 'preferences']
 */
export function getParentPath(path: string[]): string[] | null {
  if (path.length <= 1) return null;
  return path.slice(0, -1);
}

/**
 * Join namespace path segments
 */
export function joinNamespacePath(...segments: (string | string[])[]): string[] {
  return segments.flat().filter(Boolean);
}
