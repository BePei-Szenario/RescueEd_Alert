CREATE TABLE `retention_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_hash` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer NOT NULL,
	`retain_until` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_retention_actions_entity` ON `retention_actions` (`entity_type`,`entity_hash`);--> statement-breakpoint
CREATE INDEX `idx_retention_actions_expiry` ON `retention_actions` (`retain_until`);