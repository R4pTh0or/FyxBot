interface ImportMetaEnv {
  readonly VITE_FYXBOT_API_URL?: string;
  readonly VITE_NEXORA_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Fetcher {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
}

type D1Database = import('@miniflare/d1').D1Database;

declare module 'cloudflare:workers' {
  export const env: {
    DB?: D1Database;
    [binding: string]: unknown;
  };
}
