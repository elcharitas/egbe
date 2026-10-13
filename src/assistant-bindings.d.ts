// Provider credentials and model choice are Worker-only bindings.
declare namespace Cloudflare {
  interface Env {
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
  }
}
