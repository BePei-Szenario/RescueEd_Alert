CREATE TABLE `legal_acceptances` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`terms_version` text NOT NULL,
	`privacy_version` text NOT NULL,
	`avv_version` text NOT NULL,
	`accepted_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_legal_acceptances_user` ON `legal_acceptances` (`user_id`);--> statement-breakpoint
CREATE TABLE `legal_documents` (
	`document_key` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`version` text NOT NULL,
	`content` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`updated_by_user_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `pending_registrations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_name` text NOT NULL,
	`contact_name` text NOT NULL,
	`street` text NOT NULL,
	`house_number` text NOT NULL,
	`postal_code` text NOT NULL,
	`city` text NOT NULL,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`terms_version` text NOT NULL,
	`privacy_version` text NOT NULL,
	`avv_version` text NOT NULL,
	`accepted_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_pending_registrations_token_hash` ON `pending_registrations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_pending_registrations_email` ON `pending_registrations` (`email`);--> statement-breakpoint
CREATE INDEX `idx_pending_registrations_expiry` ON `pending_registrations` (`expires_at`,`used_at`);--> statement-breakpoint
ALTER TABLE `organizations` ADD `billing_house_number` text;