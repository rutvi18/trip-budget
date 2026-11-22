CREATE TABLE `contributions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`amount` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `contributions_created_at_idx` ON `contributions` (`created_at`);--> statement-breakpoint
CREATE INDEX `contributions_owner_id_idx` ON `contributions` (`owner_id`);