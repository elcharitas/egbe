// Import Workers types as a module, not conflicting browser-global declarations.
type D1Database = import('@cloudflare/workers-types').D1Database;

declare module 'cloudflare:workers' {
  export const env: Cloudflare.Env;
}

declare module '*.css?url' {
  const url: string;
  export default url;
}

interface ImportMetaEnv {
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
