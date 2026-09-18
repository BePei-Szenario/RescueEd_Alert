CREATE TABLE `billing_records` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_name` text NOT NULL,
	`organization_name` text NOT NULL,
	`recipient_name` text NOT NULL,
	`street` text NOT NULL,
	`postal_code` text NOT NULL,
	`city` text NOT NULL,
	`email` text NOT NULL,
	`event_name` text NOT NULL,
	`event_date` text NOT NULL,
	`helper_limit` integer NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`created_at` integer NOT NULL,
	`retain_until` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_billing_records_created` ON `billing_records` (`created_at`);--> statement-breakpoint
CREATE INDEX `idx_billing_records_retention` ON `billing_records` (`retain_until`);--> statement-breakpoint
INSERT INTO `billing_records` (`id`,`customer_name`,`organization_name`,`recipient_name`,`street`,`postal_code`,`city`,`email`,`event_name`,`event_date`,`helper_limit`,`amount_cents`,`currency`,`created_at`,`retain_until`)
SELECT i.`id`,COALESCE(a.`full_name`,u.`full_name`),COALESCE(a.`organization_name`,o.`name`),i.`recipient_name`,i.`street`,i.`postal_code`,i.`city`,i.`email`,e.`name`,e.`event_date`,e.`helper_limit`,i.`amount_cents`,e.`currency`,i.`created_at`,CAST(strftime('%s',printf('%04d-01-01',CAST(strftime('%Y',i.`created_at`/1000,'unixepoch') AS INTEGER)+9)) AS INTEGER)*1000
FROM `invoice_requests` i JOIN `events` e ON e.`id`=i.`event_id` JOIN `users` u ON u.`id`=e.`owner_user_id` JOIN `organizations` o ON o.`id`=e.`organization_id` LEFT JOIN `deleted_customer_archives` a ON a.`source_user_id`=u.`id`;--> statement-breakpoint
CREATE TABLE `retention_holds` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`reason` text NOT NULL,
	`reference` text NOT NULL,
	`created_at` integer NOT NULL,
	`released_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_retention_holds_active` ON `retention_holds` (`entity_type`,`entity_id`,`released_at`);--> statement-breakpoint
ALTER TABLE `support_tickets` ADD `resolved_at` integer;--> statement-breakpoint
UPDATE `support_tickets` SET `resolved_at`=`updated_at` WHERE `status`='resolved';--> statement-breakpoint
CREATE INDEX `idx_support_tickets_resolved` ON `support_tickets` (`status`,`resolved_at`);--> statement-breakpoint
UPDATE `deleted_customer_archives` SET `retention_review_at`=CAST(strftime('%s',printf('%04d-01-01',CAST(strftime('%Y',`deleted_at`/1000,'unixepoch') AS INTEGER)+4)) AS INTEGER)*1000;--> statement-breakpoint
INSERT INTO `retention_holds` (`id`,`entity_type`,`entity_id`,`reason`,`reference`,`created_at`,`released_at`)
SELECT 'hold-consumer-'||`id`,'contract_evidence',`id`,'App-Store-Vertragsende nach Kontolöschung manuell verifizieren','B2C-Abo',`deleted_at`,NULL FROM `deleted_customer_archives` WHERE json_extract(`legal_snapshot_json`,'$.accountType')='consumer';--> statement-breakpoint
ALTER TABLE `deleted_customer_archives` DROP COLUMN `billing_email`;--> statement-breakpoint
ALTER TABLE `deleted_customer_archives` DROP COLUMN `billing_street`;--> statement-breakpoint
ALTER TABLE `deleted_customer_archives` DROP COLUMN `billing_house_number`;--> statement-breakpoint
ALTER TABLE `deleted_customer_archives` DROP COLUMN `billing_postal_code`;--> statement-breakpoint
ALTER TABLE `deleted_customer_archives` DROP COLUMN `billing_city`;
