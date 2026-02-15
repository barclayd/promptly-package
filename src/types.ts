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
  get: (promptId: string, options?: GetOptions) => Promise<PromptResponse>;
  aiParams: (promptId: string, options?: AiParamsOptions) => Promise<AiParams>;
};

// --- Codegen types ---

export type PromptEntry = {
  id: string;
  name: string;
  version?: string;
};

export type PromptlyConfig = {
  apiKey: string;
  prompts: PromptEntry[];
  outputDir?: string;
};
