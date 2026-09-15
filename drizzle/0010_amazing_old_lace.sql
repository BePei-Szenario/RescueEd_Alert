ALTER TABLE `assignments` ADD `operational_status` text DEFAULT 'available' NOT NULL;--> statement-breakpoint
ALTER TABLE `assignments` ADD `deployed_at` integer;--> statement-breakpoint
ALTER TABLE `assignments` ADD `cleared_at` integer;--> statement-breakpoint
CREATE INDEX `idx_assignments_event_operational_status` ON `assignments` (`event_id`,`operational_status`);