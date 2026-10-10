// These optional values are supplied only for an approved hosted-website client.
declare namespace Cloudflare {
  interface Env {
    OPENAI_CLIENT_ID?: string;
    OPENAI_REDIRECT_URI?: string;
    OPENAI_TOKEN_AUTH_METHOD?: string;
    OPENAI_CLIENT_SECRET?: string;
  }
}
