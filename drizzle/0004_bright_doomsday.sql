CREATE TABLE `email_sender_settings` (
	`action` text PRIMARY KEY NOT NULL,
	`sender_email` text NOT NULL,
	`display_name` text DEFAULT 'RescueEd Alert' NOT NULL,
	`updated_by_user_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`updated_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `email_outbox` ADD `sender_email` text DEFAULT 'noreply@rescueed.de' NOT NULL;