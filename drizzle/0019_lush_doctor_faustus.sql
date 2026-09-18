CREATE TABLE `privacy_request_records` (
	`id` text PRIMARY KEY NOT NULL,
	`reference_hash` text NOT NULL,
	`request_type` text NOT NULL,
	`outcome` text NOT NULL,
	`completed_at` integer NOT NULL,
	`retain_until` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_privacy_request_reference` ON `privacy_request_records` (`reference_hash`);--> statement-breakpoint
CREATE INDEX `idx_privacy_request_retention` ON `privacy_request_records` (`retain_until`);--> statement-breakpoint
ALTER TABLE `retention_runs` ADD `privacy_requests_deleted` integer DEFAULT 0 NOT NULL;