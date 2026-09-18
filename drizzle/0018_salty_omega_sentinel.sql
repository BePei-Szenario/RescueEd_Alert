CREATE TABLE `retention_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`finished_at` integer NOT NULL,
	`crash_reports_deleted` integer NOT NULL,
	`rate_limits_deleted` integer NOT NULL,
	`support_tickets_deleted` integer NOT NULL,
	`contract_evidence_deleted` integer NOT NULL,
	`billing_records_deleted` integer NOT NULL,
	`expired_tokens_deleted` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_retention_runs_started` ON `retention_runs` (`created_at`);