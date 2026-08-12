export interface DomainErrorOptions {
  status: number;
  code: string;
  detail: string;
  title?: string;
  remediation?: string[];
  errors?: Array<Record<string, unknown>>;
}

export class DomainError extends Error {
  readonly status: number;
  readonly code: string;
  readonly title: string;
  readonly remediation: string[];
  readonly errors: Array<Record<string, unknown>>;

  constructor(options: DomainErrorOptions) {
    super(options.detail);
    this.name = DomainError.name;
    this.status = options.status;
    this.code = options.code;
    this.title = options.title ?? 'The command could not be completed';
    this.remediation = options.remediation ?? [];
    this.errors = options.errors ?? [];
  }
}
