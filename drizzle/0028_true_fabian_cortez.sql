ALTER TABLE `helper_devices` ADD `push_provider` text;--> statement-breakpoint
ALTER TABLE `helper_devices` ADD `push_token_encrypted` text;--> statement-breakpoint
ALTER TABLE `helper_devices` ADD `registered_at` integer;--> statement-breakpoint
ALTER TABLE `helper_devices` ADD `last_push_at` integer;--> statement-breakpoint
ALTER TABLE `helper_devices` ADD `push_failures` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `helper_devices` ADD `disabled_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_helper_devices_push_token` ON `helper_devices` (`push_token_hash`);--> statement-breakpoint
CREATE INDEX `idx_helper_devices_push_active` ON `helper_devices` (`helper_id`,`disabled_at`);