import type { Request } from 'express';

export interface RequestActor {
  id: string;
  authSubject: string;
  companyId: string | null;
  sessionId: string;
}

export interface ContextRequest extends Request {
  correlationId: string;
  actor?: RequestActor;
}
