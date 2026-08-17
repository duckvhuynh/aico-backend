const OBJECT_KEY_PATTERN =
  /^companies\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([a-z0-9-]+)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/(\d+)$/i;

export const OBJECT_PURPOSES = Object.freeze(['quality-fixture'] as const);
export type ObjectPurpose = (typeof OBJECT_PURPOSES)[number];

export interface ObjectKeyParts {
  companyId: string;
  purpose: ObjectPurpose;
  objectId: string;
  version: number;
}

export function buildObjectKey(parts: ObjectKeyParts): string {
  if (!OBJECT_PURPOSES.includes(parts.purpose)) {
    throw new Error('Unsupported object purpose');
  }
  if (!Number.isInteger(parts.version) || parts.version < 1) {
    throw new Error('Object version must be a positive integer');
  }
  return `companies/${parts.companyId}/${parts.purpose}/${parts.objectId}/${parts.version}`;
}

export function parseObjectKey(objectKey: string): ObjectKeyParts | null {
  const match = OBJECT_KEY_PATTERN.exec(objectKey);
  if (!match) {
    return null;
  }
  const purpose = match[2];
  if (!OBJECT_PURPOSES.includes(purpose as ObjectPurpose)) {
    return null;
  }
  return {
    companyId: match[1],
    purpose: purpose as ObjectPurpose,
    objectId: match[3],
    version: Number.parseInt(match[4], 10),
  };
}

export function authorizeObjectAccess(companyId: string, objectKey: string): boolean {
  const parsed = parseObjectKey(objectKey);
  return parsed !== null && parsed.companyId === companyId;
}
