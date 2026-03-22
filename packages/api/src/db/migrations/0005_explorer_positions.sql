CREATE TABLE `user_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_user_pref_unique` ON `user_preferences` (`user_id`,`tenant_id`,`key`);--> statement-breakpoint
ALTER TABLE `documents` ADD `position` text DEFAULT 'a0' NOT NULL;--> statement-breakpoint
ALTER TABLE `folders` ADD `position_index` text DEFAULT 'a0' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_documents_tenant_folder_position` ON `documents` (`tenant_id`, `folder_id`, `position`);--> statement-breakpoint
CREATE INDEX `idx_folders_tenant_position` ON `folders` (`tenant_id`, `position_index`);