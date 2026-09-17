CREATE TABLE `app_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`store` text NOT NULL,
	`store_reference_hash` text NOT NULL,
	`store_reference_encrypted` text NOT NULL,
	`product_id` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`expires_at` integer,
	`last_verified_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_app_subscriptions_store_ref` ON `app_subscriptions` (`store`,`store_reference_hash`);--> statement-breakpoint
CREATE INDEX `idx_app_subscriptions_user_status` ON `app_subscriptions` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `pending_consumer_registrations` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`code_hash` text NOT NULL,
	`legal_evidence_json` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`accepted_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_pending_consumer_email` ON `pending_consumer_registrations` (`email`);--> statement-breakpoint
CREATE INDEX `idx_pending_consumer_expiry` ON `pending_consumer_registrations` (`expires_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `account_type` text DEFAULT 'organization' NOT NULL;