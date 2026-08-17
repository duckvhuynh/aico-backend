import { DomainError } from '../domain/domain-error';
import type { RequestActor } from '../http/request-context';

export interface CompanyScope {
  readonly companyId: string;
}

export function tenantResourceNotFound(): DomainError {
  return new DomainError({
    status: 404,
    code: 'resource_not_found',
    title: 'Resource not found',
    detail: 'The requested resource does not exist.',
  });
}

export function companyScopeFromActor(actor: RequestActor): CompanyScope {
  return requireCompanyScope(actor.companyId);
}

export function requireCompanyScope(companyId: string | null | undefined): CompanyScope {
  if (typeof companyId !== 'string' || companyId.length === 0) {
    throw tenantResourceNotFound();
  }
  return Object.freeze({ companyId });
}
