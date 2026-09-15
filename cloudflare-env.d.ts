declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    EMAIL_PAYLOAD_KEY?: string;
  }
}
