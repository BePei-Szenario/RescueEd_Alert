ALTER TABLE `events` ADD `end_date` text;--> statement-breakpoint
ALTER TABLE `organizations` ADD `unlimited_event_duration` integer DEFAULT false NOT NULL;