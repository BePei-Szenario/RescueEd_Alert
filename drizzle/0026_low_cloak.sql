CREATE TABLE `app_subscription_withdrawals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`subscription_id` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`store` text NOT NULL,
	`product_id` text NOT NULL,
	`store_reference_hash` text NOT NULL,
	`statement` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`requested_at` integer NOT NULL,
	`confirmation_queued_at` integer NOT NULL,
	`resolved_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_subscription_withdrawal_subscription` ON `app_subscription_withdrawals` (`subscription_id`);--> statement-breakpoint
CREATE INDEX `idx_subscription_withdrawal_user` ON `app_subscription_withdrawals` (`user_id`,`requested_at`);--> statement-breakpoint
CREATE INDEX `idx_subscription_withdrawal_status` ON `app_subscription_withdrawals` (`status`,`requested_at`);--> statement-breakpoint
ALTER TABLE `app_subscriptions` ADD `purchased_at` integer;--> statement-breakpoint
ALTER TABLE `app_subscriptions` ADD `legal_evidence_json` text;--> statement-breakpoint
ALTER TABLE `app_subscriptions` ADD `legal_accepted_at` integer;