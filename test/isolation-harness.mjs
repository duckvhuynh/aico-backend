const FOREIGN_DENIAL = Object.freeze({
  status: 404,
  code: 'resource_not_found',
});

export function serializeBody(body) {
  return JSON.stringify(body ?? {}).toLowerCase();
}

export function assert(condition, message) {
  if (!condition) throw new Error(message);
}

export function assertNonDisclosingDenial(result, needles, label) {
  assert(
    result.response.status === FOREIGN_DENIAL.status,
    `${label} status ${result.response.status}`,
  );
  assert(result.body.code === FOREIGN_DENIAL.code, `${label} code ${result.body.code}`);
  const serialized = serializeBody(result.body);
  for (const needle of needles) {
    assert(!serialized.includes(String(needle).toLowerCase()), `${label} leaked ${needle}`);
  }
}

export function assertEquivalentAbsence(foreignResult, absentResult, label) {
  assert(
    foreignResult.response.status === absentResult.response.status,
    `${label} status diverged`,
  );
  assert(foreignResult.body.code === absentResult.body.code, `${label} code diverged`);
  assert(foreignResult.body.title === absentResult.body.title, `${label} title diverged`);
}

export function authorizeObjectAccess(companyId, objectKey) {
  return objectKey.startsWith(`companies/${companyId}/`);
}

export function buildObjectKey(companyId, purpose, objectId, version) {
  return `companies/${companyId}/${purpose}/${objectId}/${version}`;
}
