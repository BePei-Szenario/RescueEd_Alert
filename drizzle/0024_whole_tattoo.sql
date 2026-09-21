CREATE TABLE `event_access_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`role` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`last_used_at` integer,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_event_access_codes_hash` ON `event_access_codes` (`code_hash`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_event_access_codes_event_role` ON `event_access_codes` (`event_id`,`role`);--> statement-breakpoint
CREATE INDEX `idx_event_access_codes_event` ON `event_access_codes` (`event_id`,`revoked_at`);--> statement-breakpoint
CREATE TABLE `event_access_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`access_code_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`access_code_id`) REFERENCES `event_access_codes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_event_access_sessions_token` ON `event_access_sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_event_access_sessions_code` ON `event_access_sessions` (`access_code_id`);--> statement-breakpoint
CREATE INDEX `idx_event_access_sessions_expiry` ON `event_access_sessions` (`expires_at`);--> statement-breakpoint
ALTER TABLE `alerts` ADD `created_by_event_access_id` text REFERENCES event_access_codes(id);