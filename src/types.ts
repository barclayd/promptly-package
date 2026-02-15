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
  model: string;
  temperature: number;
  inputData: unknown;
  inputDataRootName: string | null;
};

export type PublishedVersion = {
  version: string;
  userMessage: string;
};

export type PromptResponse = {
  promptId: string;
  promptName: string;
  version: string;
  systemMessage: string;
  userMessage: string;
  config: PromptConfig;
  publishedVersions?: PublishedVersion[];
};

// Augmentable by codegen via declaration merging
// (must be interface — only interfaces support declaration merging)
// biome-ignore lint/suspicious/noEmptyInterface: declaration merging target populated by codegen
export interface PromptVariableMap {}

// Suggests known prompt IDs with autocomplete, accepts any string
export type PromptId = keyof PromptVariableMap | (string & {});

// Strict version type: only codegen-known versions for known prompts
// Excludes 'latest' — it's a type-level default, not a real API version string
export type PromptVersion<Id extends string> =
  Id extends keyof PromptVariableMap
    ? Exclude<keyof PromptVariableMap[Id], 'latest'>
    : string;

// Resolves variables for a prompt ID + version (default: latest)
type VariablesFor<
  Id extends string,
  Ver extends string = 'latest',
> = Id extends keyof PromptVariableMap
  ? Ver extends keyof PromptVariableMap[Id]
    ? PromptVariableMap[Id][Ver]
    : Record<string, string>
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
  model: import('ai').LanguageModel;
};

// --- Batch types ---

export type PromptRequest = {
  promptId: string;
  version?: string;
};

// Mapped tuple: each position gets its own typed PromptResult
type GetPromptsResults<T extends readonly PromptRequest[]> = {
  [K in keyof T]: T[K] extends {
    promptId: infer Id extends string;
    version: infer Ver extends string;
  }
    ? PromptResult<VariablesFor<Id, Ver>>
    : T[K] extends { promptId: infer Id extends string }
      ? PromptResult<VariablesFor<Id, 'latest'>>
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

export type PromptlyClientConfig = {
  apiKey: string;
  baseUrl?: string;
};

export type GetOptions<V extends string = string> = {
  version?: V;
};

export type AiParamsOptions = {
  version?: string;
  variables?: Record<string, string>;
};

export type AiParams = {
  system: string;
  prompt: string;
  temperature: number;
  model: import('ai').LanguageModel;
  output?: ReturnType<typeof import('ai').Output.object>;
};

export type PromptlyClient = {
  get: <T extends string, V extends PromptVersion<T> | 'latest' = 'latest'>(
    promptId: T,
    options?: GetOptions<V>,
  ) => Promise<PromptResult<VariablesFor<T, V>>>;

  getPrompts: <const T extends readonly PromptRequest[]>(
    entries: T,
  ) => Promise<GetPromptsResults<T>>;

  aiParams: <
    T extends string,
    V extends PromptVersion<T> | 'latest' = 'latest',
  >(
    promptId: T,
    options?: { version?: V; variables?: VariablesFor<T, V> },
  ) => Promise<AiParams>;
};
