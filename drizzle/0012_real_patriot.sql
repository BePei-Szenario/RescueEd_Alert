CREATE TABLE `deleted_customer_archives` (
	`id` text PRIMARY KEY NOT NULL,
	`source_user_id` text NOT NULL,
	`source_organization_id` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`organization_name` text NOT NULL,
	`billing_email` text NOT NULL,
	`billing_street` text,
	`billing_house_number` text,
	`billing_postal_code` text,
	`billing_city` text,
	`legal_snapshot_json` text NOT NULL,
	`account_created_at` integer NOT NULL,
	`deleted_at` integer NOT NULL,
	`retention_review_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_deleted_customer_archives_user` ON `deleted_customer_archives` (`source_user_id`);--> statement-breakpoint
CREATE INDEX `idx_deleted_customer_archives_deleted_at` ON `deleted_customer_archives` (`deleted_at`);--> statement-breakpoint
CREATE INDEX `idx_deleted_customer_archives_review_at` ON `deleted_customer_archives` (`retention_review_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `deleted_at` integer;