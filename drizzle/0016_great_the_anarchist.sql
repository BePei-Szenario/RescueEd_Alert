CREATE TABLE `app_crash_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`app_version` text NOT NULL,
	`source` text NOT NULL,
	`error_kind` text NOT NULL,
	`stack_excerpt` text NOT NULL,
	`fingerprint` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_app_crash_reports_created` ON `app_crash_reports` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_app_crash_reports_fingerprint` ON `app_crash_reports` (`fingerprint`,`created_at`);--> statement-breakpoint
CREATE TABLE `support_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`author_type` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `support_tickets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_support_messages_ticket_created` ON `support_messages` (`ticket_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`requester_type` text NOT NULL,
	`requester_user_id` text,
	`requester_helper_id` text,
	`event_id` text,
	`subject` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`requester_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_support_tickets_status_updated` ON `support_tickets` (`status`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_support_tickets_user` ON `support_tickets` (`requester_user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_support_tickets_helper` ON `support_tickets` (`requester_helper_id`,`created_at`);