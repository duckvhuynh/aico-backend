import {
  type ModelProviderInvocationRequestV1,
  type ModelProviderInvocationResultV1,
  type ModelProviderPortV1,
  type ProviderReconciliationPortV1,
} from './contracts';
import { resultWithRequest } from './fixture';

export class DeferredBarrier {
  private reachedResolve!: () => void;
  private releaseResolve!: () => void;
  private released = false;
  readonly reached: Promise<void>;
  private readonly releasePromise: Promise<void>;

  constructor() {
    this.reached = new Promise<void>((resolve) => {
      this.reachedResolve = resolve;
    });
    this.releasePromise = new Promise<void>((resolve) => {
      this.releaseResolve = resolve;
    });
  }

  async hold(): Promise<void> {
    this.reachedResolve();
    await this.releasePromise;
  }

  release(): void {
    if (this.released) return;
    this.released = true;
    this.releaseResolve();
  }
}

export interface ScriptedProviderOptions {
  readonly result: ModelProviderInvocationResultV1;
  readonly barrier?: DeferredBarrier;
  readonly reconciliationResult?: ModelProviderInvocationResultV1 | null;
  readonly honorAbort?: boolean;
  readonly throwOnInvoke?: boolean;
}

export class ScriptedModelProviderAdapter
  implements ModelProviderPortV1, ProviderReconciliationPortV1
{
  readonly receivedRequests: ModelProviderInvocationRequestV1[] = [];
  readonly lookupRequests: Array<Readonly<Record<string, unknown>>> = [];
  readonly observedAbortSignals: boolean[] = [];
  readonly networkCalls = 0;
  readonly productionCredentials = 0;
  private aborted = false;
  private scriptedResult: ModelProviderInvocationResultV1;

  constructor(private readonly options: ScriptedProviderOptions) {
    this.scriptedResult = structuredClone(options.result);
  }

  setResult(result: ModelProviderInvocationResultV1): void {
    this.scriptedResult = structuredClone(result);
  }

  async invoke(
    request: ModelProviderInvocationRequestV1,
    signal: AbortSignal,
  ): Promise<ModelProviderInvocationResultV1> {
    this.receivedRequests.push(structuredClone(request));
    const observe = (): void => {
      this.aborted = true;
    };
    signal.addEventListener('abort', observe, { once: true });
    if (signal.aborted) observe();
    if (this.options.barrier) await this.options.barrier.hold();
    this.observedAbortSignals.push(this.aborted || signal.aborted);
    signal.removeEventListener('abort', observe);
    if (this.options.throwOnInvoke === true) {
      throw new Error('AICO005_SCRIPTED_ADAPTER_FAILURE');
    }

    if (this.options.honorAbort === true && signal.aborted) {
      const canceled = structuredClone(this.scriptedResult) as unknown as Record<string, unknown>;
      canceled.status = 'CANCELED';
      canceled.candidate_output = null;
      canceled.finish_reason = 'CANCELED';
      canceled.failure = {
        failure_id: '49000000-0000-4000-8000-000000000020',
        classification: 'CANCELED',
        reason_code: 'ABORT_SIGNAL_OBSERVED',
        safe_message: 'The deterministic proof observed cancellation.',
        dispatch_phase: 'DISPATCHED',
        retry_guidance: 'NO_RETRY',
        retryable: false,
        retry_after: null,
        reconciliation_required: true,
        reconciliation_action: 'CANCEL_OR_LOOKUP',
        provider_safe_code: null,
        diagnostic_ref: null,
      };
      return resultWithRequest(canceled as unknown as ModelProviderInvocationResultV1, request);
    }
    return resultWithRequest(structuredClone(this.scriptedResult), request);
  }

  async lookup(
    request: Readonly<{
      invocation_id: string;
      logical_idempotency_key: string;
      request_digest: `sha256:${string}`;
    }>,
    signal: AbortSignal,
  ): Promise<ModelProviderInvocationResultV1 | null> {
    this.lookupRequests.push({ ...request });
    this.observedAbortSignals.push(signal.aborted);
    const result = this.options.reconciliationResult;
    return result === undefined || result === null ? null : structuredClone(result);
  }

  get abortObserved(): boolean {
    return this.aborted;
  }
}
