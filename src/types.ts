// --- Schema types ---

export type ValidationRule = {
  id: string;
  type: string;
  message: string;
  value: string;
  transform?: string;
  keyType?: string;
  valueType?: string;
  discriminator?: string;
  cases?: Record<string, SchemaField[]>;
};

export type SchemaFieldParams = {
  coerce?: boolean;
  description?: string;
  enumValues?: string[];
  unionTypes?: string[];
  elementType?: string;
  keyType?: string;
  valueType?: string;
  isTuple?: boolean;
  tupleTypes?: string[];
  isStrict?: boolean;
  isPassthrough?: boolean;
  isDiscriminatedUnion?: boolean;
  discriminator?: string;
  discriminatedUnion?: {
    discriminator: string;
    cases: Record<
      string,
      {
        value: string;
        fields: SchemaField[];
      }
    >;
  };
  stringOptions?: {
    datetime?: { offset?: boolean; precision?: number };
    ip?: { version?: 'v4' | 'v6' };
  };
};

export type SchemaField = {
  id: string;
  name: string;
  type: string;
  validations: ValidationRule[];
  params: SchemaFieldParams;
};

// --- API types ---

export type PromptConfig = {
  schema: SchemaField[];
  model: string | null;
  temperature: number;
  inputData: unknown;
  inputDataRootName: string | null;
};

export type PromptResponse = {
  promptId: string;
  promptName: string;
  version: string;
  systemMessage: string;
  userMessage: string;
  config: PromptConfig;
};

// Augmentable by codegen via declaration merging
// (must be interface — only interfaces support declaration merging)
// biome-ignore lint/suspicious/noEmptyInterface: declaration merging target populated by codegen
export interface PromptVariableMap {}

// Suggests known prompt IDs with autocomplete, accepts any string
export type PromptId = keyof PromptVariableMap | (string & {});

// Resolves variables for a prompt ID
type VariablesFor<Id extends string> = Id extends keyof PromptVariableMap
  ? PromptVariableMap[Id]
  : Record<string, string>;

// Generic over variable shape
export type PromptMessage<
  V extends Record<string, string> = Record<string, string>,
> = {
  (variables: V): string;
  toString(): string;
};

export type PromptResult<
  V extends Record<string, string> = Record<string, string>,
> = Omit<PromptResponse, 'userMessage'> & {
  userMessage: PromptMessage<V>;
  temperature: number;
};

// --- Batch types ---

export type PromptRequest = {
  promptId: string;
  version?: string;
};

// Mapped tuple: each position gets its own typed PromptResult
type GetPromptsResults<T extends readonly PromptRequest[]> = {
  [K in keyof T]: T[K] extends { promptId: infer Id extends string }
    ? PromptResult<VariablesFor<Id>>
    : PromptResult;
};

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_KEY'
  | 'NOT_FOUND'
  | 'VERSION_NOT_FOUND'
  | 'BAD_REQUEST'
  | 'USAGE_LIMIT_EXCEEDED';

export type ErrorResponse = {
  error: string;
  code: ErrorCode;
  usage?: unknown;
  upgradeUrl?: string;
};

// --- Client types ---

export type PromptClientConfig = {
  apiKey: string;
  baseUrl?: string;
};

export type GetOptions = {
  version?: string;
};

export type AiParamsOptions = {
  version?: string;
  variables?: Record<string, string>;
};

export type AiParams = {
  system: string;
  prompt: string;
  temperature: number;
  output?: ReturnType<typeof import('ai').Output.object>;
};

export type PromptClient = {
  get: <T extends string>(
    promptId: T,
    options?: GetOptions,
  ) => Promise<PromptResult<VariablesFor<T>>>;

  getPrompts: <const T extends readonly PromptRequest[]>(
    entries: T,
  ) => Promise<GetPromptsResults<T>>;

  aiParams: (promptId: string, options?: AiParamsOptions) => Promise<AiParams>;
};
