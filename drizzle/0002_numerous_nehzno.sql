ALTER TABLE `users` ADD `role` text DEFAULT 'customer' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `mfa_enabled` integer DEFAULT true NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_users_role_status` ON `users` (`role`,`status`);