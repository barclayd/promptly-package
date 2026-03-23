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

// --- Composer API types ---

export type ComposerStaticSegment = {
  type: 'static';
  content: string;
};

export type ComposerPromptSegment = {
  type: 'prompt';
  promptId: string;
  promptName: string;
  version: string;
  systemMessage: string | null;
  userMessage: string | null;
  config: Record<string, unknown>;
};

export type ComposerSegment = ComposerStaticSegment | ComposerPromptSegment;

export type ComposerConfig = {
  schema: SchemaField[];
  inputData: unknown;
  inputDataRootName: string | null;
};

export type ComposerResponse = {
  composerId: string;
  composerName: string;
  version: string;
  config: ComposerConfig;
  segments: ComposerSegment[];
  publishedVersions?: { version: string }[];
};

// Augmentable by codegen via declaration merging
// (must be interface — only interfaces support declaration merging)
// biome-ignore lint/suspicious/noEmptyInterface: declaration merging target populated by codegen
export interface ComposerVariableMap {}

// biome-ignore lint/suspicious/noEmptyInterface: declaration merging target populated by codegen
export interface ComposerPromptMap {}

// Suggests known composer IDs with autocomplete, accepts any string
export type ComposerId = keyof ComposerVariableMap | (string & {});

// Strict version type: only codegen-known versions for known composers
export type ComposerVersion<Id extends string> =
  Id extends keyof ComposerVariableMap
    ? Exclude<keyof ComposerVariableMap[Id], 'latest'>
    : string;

// Resolves input shape for a composer ID + version (default: latest)
export type ComposerInputFor<
  Id extends string,
  Ver extends string = 'latest',
> = Id extends keyof ComposerVariableMap
  ? Ver extends keyof ComposerVariableMap[Id]
    ? ComposerVariableMap[Id][Ver]
    : Record<string, string>
  : Record<string, string>;

// Resolves prompt names for a composer ID from ComposerPromptMap
export type ComposerPromptNamesFor<Id extends string> =
  Id extends keyof ComposerPromptMap ? ComposerPromptMap[Id] : string;

// AI SDK compatible prompt shape — spread directly into generateText()
export type ComposerPrompt = {
  model: import('ai').LanguageModel;
  system: string | undefined;
  prompt: string;
  temperature: number;
  promptId: string;
  promptName: string;
};

export type FormatInput = { text: string } | string;

export type ComposerFormatFn<Names extends string = string> = (
  results: Record<Names, FormatInput>,
) => string;

export type ComposerResult<Names extends string = string> = {
  composerId: string;
  composerName: string;
  version: string;
  config: ComposerConfig;
  segments: ComposerSegment[];
  prompts: ComposerPrompt[];
  formatComposer: ComposerFormatFn<Names>;
} & {
  [K in Names]: ComposerPrompt;
};

export type GetComposerOptions<
  Id extends string = string,
  V extends string = 'latest',
> = {
  input?: ComposerInputFor<Id, V>;
  version?: V;
};

// --- Composer batch types ---

export type ComposerRequest = {
  composerId: string;
  input?: Record<string, string>;
  version?: string;
};

// Mapped tuple: each position gets its own typed ComposerResult
type GetComposersResults<T extends readonly ComposerRequest[]> = {
  [K in keyof T]: T[K] extends { composerId: infer Id extends string }
    ? ComposerResult<ComposerPromptNamesFor<Id>>
    : ComposerResult;
};

export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_KEY'
  | 'NOT_FOUND'
  | 'VERSION_NOT_FOUND'
  | 'BAD_REQUEST'
  | 'USAGE_LIMIT_EXCEEDED'
  | 'UNRESOLVED_PROMPT';

export type ErrorResponse = {
  error: string;
  code: ErrorCode;
  usage?: unknown;
  upgradeUrl?: string;
};

// --- Client types ---

export type PromptlyClientConfig = {
  apiKey?: string;
  baseUrl?: string;
  model?: (modelId: string) => import('ai').LanguageModel;
};

export type GetOptions<V extends string = string> = {
  version?: V;
};

export type PromptlyClient = {
  getPrompt: <
    T extends string,
    V extends PromptVersion<T> | 'latest' = 'latest',
  >(
    promptId: T,
    options?: GetOptions<V>,
  ) => Promise<PromptResult<VariablesFor<T, V>>>;

  getPrompts: <const T extends readonly PromptRequest[]>(
    entries: T,
  ) => Promise<GetPromptsResults<T>>;

  getComposer: <
    T extends string,
    V extends ComposerVersion<T> | 'latest' = 'latest',
  >(
    composerId: T,
    options?: GetComposerOptions<T, V>,
  ) => Promise<ComposerResult<ComposerPromptNamesFor<T>>>;

  getComposers: <const T extends readonly ComposerRequest[]>(
    entries: T,
  ) => Promise<GetComposersResults<T>>;
};
