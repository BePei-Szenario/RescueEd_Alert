CREATE TABLE `alert_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`alert_id` text NOT NULL,
	`assignment_id` text NOT NULL,
	FOREIGN KEY (`alert_id`) REFERENCES `alerts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_alert_assignments_pair` ON `alert_assignments` (`alert_id`,`assignment_id`);--> statement-breakpoint
CREATE TABLE `alert_recipients` (
	`id` text PRIMARY KEY NOT NULL,
	`alert_id` text NOT NULL,
	`helper_id` text NOT NULL,
	`sent_at` integer NOT NULL,
	`acknowledged_at` integer,
	FOREIGN KEY (`alert_id`) REFERENCES `alerts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`helper_id`) REFERENCES `helpers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_alert_recipients_pair` ON `alert_recipients` (`alert_id`,`helper_id`);--> statement-breakpoint
CREATE INDEX `idx_alert_recipients_alert_ack` ON `alert_recipients` (`alert_id`,`acknowledged_at`);--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`message` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_alerts_event_created` ON `alerts` (`event_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_assignments_event_name` ON `assignments` (`event_id`,`name`);--> statement-breakpoint
CREATE TABLE `event_administrators` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text,
	`role` text NOT NULL,
	`invite_token_hash` text,
	`invite_expires_at` integer,
	`accepted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_event_admins_event_id` ON `event_administrators` (`event_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_event_admins_event_user` ON `event_administrators` (`event_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`owner_user_id` text NOT NULL,
	`name` text NOT NULL,
	`event_date` text NOT NULL,
	`start_time` text,
	`end_time` text,
	`helper_limit` integer NOT NULL,
	`price_cents` integer NOT NULL,
	`currency` text DEFAULT 'EUR' NOT NULL,
	`public_join_token_hash` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`ended_at` integer,
	`delete_helpers_after` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_events_organization_status` ON `events` (`organization_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_events_join_token_hash` ON `events` (`public_join_token_hash`);--> statement-breakpoint
CREATE TABLE `helper_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`helper_id` text NOT NULL,
	`platform` text NOT NULL,
	`alarm_tone` text DEFAULT 'signal' NOT NULL,
	`push_token_hash` text,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`helper_id`) REFERENCES `helpers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_helper_devices_helper_id` ON `helper_devices` (`helper_id`);--> statement-breakpoint
CREATE TABLE `helpers` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`assignment_id` text,
	`name` text NOT NULL,
	`session_token_hash` text NOT NULL,
	`registered_at` integer NOT NULL,
	`removed_at` integer,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assignment_id`) REFERENCES `assignments`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_helpers_event_active` ON `helpers` (`event_id`,`removed_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_helpers_session_token_hash` ON `helpers` (`session_token_hash`);--> statement-breakpoint
CREATE TABLE `invoice_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`recipient_name` text NOT NULL,
	`street` text NOT NULL,
	`postal_code` text NOT NULL,
	`city` text NOT NULL,
	`email` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`transmitted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_invoice_requests_event_id` ON `invoice_requests` (`event_id`);--> statement-breakpoint
CREATE INDEX `idx_invoice_requests_status` ON `invoice_requests` (`status`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`billing_email` text NOT NULL,
	`billing_street` text,
	`billing_postal_code` text,
	`billing_city` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_sessions_token_hash` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_sessions_user_id` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`full_name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`email_verified_at` integer,
	`created_at` integer NOT NULL,
	`last_login_at` integer,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_users_email` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_users_organization_id` ON `users` (`organization_id`);