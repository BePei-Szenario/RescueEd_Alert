ALTER TABLE `organizations` ADD `duty_plan_enabled` integer NOT NULL DEFAULT 0;
ALTER TABLE `organizations` ADD `duty_email_signature` text NOT NULL DEFAULT '';

CREATE TABLE `duty_shifts` (
 `id` text PRIMARY KEY NOT NULL,
 `event_id` text NOT NULL REFERENCES `events`(`id`) ON DELETE CASCADE,
 `assignment_id` text NOT NULL REFERENCES `assignments`(`id`) ON DELETE CASCADE,
 `title` text NOT NULL,
 `start_at` integer NOT NULL,
 `end_at` integer NOT NULL,
 `capacity` integer NOT NULL CHECK (`capacity` > 0),
 `reserved` integer NOT NULL DEFAULT 0 CHECK (`reserved` IN (0, 1)),
 `created_by_user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE RESTRICT,
 `created_at` integer NOT NULL,
 CHECK (`end_at` > `start_at`)
);
CREATE INDEX `idx_duty_shifts_event_start` ON `duty_shifts` (`event_id`,`start_at`);
CREATE INDEX `idx_duty_shifts_assignment` ON `duty_shifts` (`assignment_id`);

CREATE TABLE `duty_invitations` (
 `id` text PRIMARY KEY NOT NULL,
 `event_id` text NOT NULL REFERENCES `events`(`id`) ON DELETE CASCADE,
 `email_hash` text NOT NULL,
 `email_encrypted` text NOT NULL,
 `token_hash` text NOT NULL,
 `expires_at` integer NOT NULL,
 `used_at` integer,
 `organizer_note` text,
 `created_by_user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE RESTRICT,
 `created_at` integer NOT NULL
);
CREATE UNIQUE INDEX `uidx_duty_invitations_token` ON `duty_invitations` (`token_hash`);
CREATE INDEX `idx_duty_invitations_event_email` ON `duty_invitations` (`event_id`,`email_hash`);
CREATE INDEX `idx_duty_invitations_expiry` ON `duty_invitations` (`expires_at`,`used_at`);

CREATE TABLE `duty_bookings` (
 `id` text PRIMARY KEY NOT NULL,
 `shift_id` text NOT NULL REFERENCES `duty_shifts`(`id`) ON DELETE CASCADE,
 `invitation_id` text REFERENCES `duty_invitations`(`id`) ON DELETE SET NULL,
 `first_name` text NOT NULL,
 `last_name` text NOT NULL,
 `email_hash` text NOT NULL,
 `email_encrypted` text NOT NULL,
 `qualification` text,
 `organizer_note` text,
 `code_hash` text NOT NULL,
 `code_encrypted` text NOT NULL,
 `helper_id` text REFERENCES `helpers`(`id`) ON DELETE SET NULL,
 `redeemed_at` integer,
 `reminder_sent_at` integer,
 `created_at` integer NOT NULL
);
CREATE UNIQUE INDEX `uidx_duty_bookings_code` ON `duty_bookings` (`code_hash`);
CREATE UNIQUE INDEX `uidx_duty_bookings_invitation_shift` ON `duty_bookings` (`invitation_id`,`shift_id`);
CREATE INDEX `idx_duty_bookings_shift` ON `duty_bookings` (`shift_id`);
CREATE INDEX `idx_duty_bookings_email` ON `duty_bookings` (`email_hash`);
CREATE INDEX `idx_duty_bookings_helper` ON `duty_bookings` (`helper_id`);

ALTER TABLE `email_outbox` ADD `event_id` text REFERENCES `events`(`id`) ON DELETE CASCADE;
ALTER TABLE `email_outbox` ADD `duty_booking_id` text REFERENCES `duty_bookings`(`id`) ON DELETE CASCADE;
ALTER TABLE `email_outbox` ADD `scheduled_at` integer;
CREATE INDEX `idx_email_outbox_event` ON `email_outbox` (`event_id`);
CREATE INDEX `idx_email_outbox_duty_booking` ON `email_outbox` (`duty_booking_id`);
CREATE INDEX `idx_email_outbox_scheduled` ON `email_outbox` (`status`,`scheduled_at`);
