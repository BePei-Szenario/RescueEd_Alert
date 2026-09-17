CREATE TABLE `legal_acknowledgements` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`organization_id` text NOT NULL,
	`document_version_id` text NOT NULL,
	`document_key` text NOT NULL,
	`document_version` text NOT NULL,
	`document_hash` text NOT NULL,
	`acknowledgement_type` text NOT NULL,
	`accepted_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_version_id`) REFERENCES `legal_document_versions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_legal_ack_user_document` ON `legal_acknowledgements` (`user_id`,`document_version_id`);--> statement-breakpoint
CREATE INDEX `idx_legal_ack_org` ON `legal_acknowledgements` (`organization_id`);--> statement-breakpoint
CREATE TABLE `legal_document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_key` text NOT NULL,
	`title` text NOT NULL,
	`version` text NOT NULL,
	`content` text NOT NULL,
	`content_hash` text NOT NULL,
	`published_at` integer NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uidx_legal_document_versions_key_version` ON `legal_document_versions` (`document_key`,`version`);--> statement-breakpoint
CREATE INDEX `idx_legal_document_versions_key_archived` ON `legal_document_versions` (`document_key`,`archived_at`);--> statement-breakpoint
ALTER TABLE `pending_registrations` ADD `legal_evidence_json` text;