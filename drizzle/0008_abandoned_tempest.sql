CREATE TABLE `auth_rate_limits` (
	`key_hash` text PRIMARY KEY NOT NULL,
	`scope` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`window_started_at` integer NOT NULL,
	`blocked_until` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_auth_rate_limits_expiry` ON `auth_rate_limits` (`blocked_until`,`window_started_at`);--> statement-breakpoint
ALTER TABLE `email_outbox` ADD `sensitive_expires_at` integer;--> statement-breakpoint
UPDATE `email_outbox`
SET `sensitive_expires_at` = `created_at` + CASE WHEN `type` = 'mfa' THEN 600000 WHEN `type` = 'password_reset' THEN 1800000 ELSE 86400000 END
WHERE `type` IN ('mfa','registration_link','password_reset') AND `sensitive_expires_at` IS NULL;--> statement-breakpoint
UPDATE `email_outbox`
SET `payload_json` = '{"redacted":true,"reason":"delivered_or_expired"}'
WHERE `type` IN ('mfa','registration_link','password_reset') AND (`status` = 'sent' OR `sensitive_expires_at` <= unixepoch('subsec') * 1000);--> statement-breakpoint
CREATE INDEX `idx_email_outbox_sensitive_expiry` ON `email_outbox` (`sensitive_expires_at`);--> statement-breakpoint
ALTER TABLE `security_tokens` ADD `challenge_hash` text;--> statement-breakpoint
ALTER TABLE `security_tokens` ADD `challenge_area` text;--> statement-breakpoint
ALTER TABLE `security_tokens` ADD `sends` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_security_tokens_challenge_hash` ON `security_tokens` (`challenge_hash`);
