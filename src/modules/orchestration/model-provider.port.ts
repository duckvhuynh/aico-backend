export interface ModelInvocation {
  task_type: string;
  attempt_id: string;
  context: Record<string, unknown>;
}

export interface ModelUsage {
  input_tokens: number;
  output_tokens: number;
  cost_minor: string;
}

export interface ModelResult {
  output_schema_version: string;
  content: Record<string, unknown>;
  provider: string;
  model: string;
  model_revision: string;
  usage: ModelUsage;
}

export interface ModelProviderPort {
  invoke(input: ModelInvocation): Promise<ModelResult>;
}

export const MODEL_PROVIDER = Symbol('MODEL_PROVIDER');
