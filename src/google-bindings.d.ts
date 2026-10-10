// Google credentials are injected as Worker bindings, never browser globals.
declare namespace Cloudflare {
  interface Env {
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GOOGLE_REDIRECT_URI?: string;
  }
}
