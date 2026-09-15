DROP INDEX `uidx_security_tokens_hash`;--> statement-breakpoint
CREATE INDEX `idx_security_tokens_hash` ON `security_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_auth_rate_limits_updated_at` ON `auth_rate_limits` (`updated_at`);