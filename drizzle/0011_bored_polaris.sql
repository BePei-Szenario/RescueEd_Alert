ALTER TABLE `organizations` ADD `complimentary_access` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `organizations` ADD `complimentary_granted_at` integer;--> statement-breakpoint
ALTER TABLE `organizations` ADD `complimentary_granted_by_user_id` text REFERENCES users(id);