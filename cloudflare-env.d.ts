declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    EMAIL_PAYLOAD_KEY?: string;
    APP_SUBSCRIPTION_KEY?: string;
    GOOGLE_PLAY_PACKAGE_NAME?: string;
    GOOGLE_PLAY_PRODUCT_ID?: string;
    GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?: string;
    APPLE_BUNDLE_ID?: string;
    APPLE_PRODUCT_ID?: string;
    APPLE_ISSUER_ID?: string;
    APPLE_KEY_ID?: string;
    APPLE_PRIVATE_KEY?: string;
    APPLE_ALLOW_SANDBOX?: string;
  }
}
