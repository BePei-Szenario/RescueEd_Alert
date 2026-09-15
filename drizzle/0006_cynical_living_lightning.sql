ALTER TABLE `events` ADD `check_in_code` text;--> statement-breakpoint
ALTER TABLE `events` ADD `check_out_code` text;--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_events_check_in_code` ON `events` (`check_in_code`);--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_events_check_out_code` ON `events` (`check_out_code`);--> statement-breakpoint
ALTER TABLE `helpers` ADD `first_name` text;--> statement-breakpoint
ALTER TABLE `helpers` ADD `last_name` text;--> statement-breakpoint
ALTER TABLE `helpers` ADD `qualification` text DEFAULT 'Nicht angegeben' NOT NULL;