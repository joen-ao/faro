export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

export interface RawCompletion {
  text: string;
  usage: Usage;
}

/** Low-level adapter: one prompt in, raw text + usage out. */
export interface AnthropicAdapter {
  readonly model: string;
  readonly isMock: boolean;
  completeRaw(prompt: string): Promise<RawCompletion>;
}

export interface CallRecord {
  service: "anthropic";
  endpoint: string;
  status: number;
  latencyMs: number;
  error: string | null;
  isMock: boolean;
}

/** Injectable sink for `api_calls` rows. */
export type CallRecorder = (record: CallRecord) => void | Promise<void>;

export interface CompleteResult<T> {
  data: T;
  usage: Usage;
  model: string;
  is_mock: boolean;
}

/** Base for AI failures; always carries the (possibly billed) usage so cost is never lost. */
export class AiError extends Error {
  constructor(
    message: string,
    public readonly usage: Usage,
    public readonly model: string,
    public readonly isMock: boolean,
  ) {
    super(message);
    this.name = "AiError";
  }
}

export class AiValidationError extends AiError {
  constructor(message: string, usage: Usage, model: string, isMock: boolean) {
    super(message, usage, model, isMock);
    this.name = "AiValidationError";
  }
}

export class AiCallError extends AiError {
  constructor(message: string, usage: Usage, model: string, isMock: boolean) {
    super(message, usage, model, isMock);
    this.name = "AiCallError";
  }
}
