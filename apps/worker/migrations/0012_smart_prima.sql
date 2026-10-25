CREATE TABLE `mailbox_shares` (
	`mailbox_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`granted_by` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`mailbox_id`, `user_id`)
);
--> statement-breakpoint
CREATE INDEX `idx_mailbox_shares_user` ON `mailbox_shares` (`user_id`);