CREATE TABLE `import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`target_folder_id` text,
	`total_docs` integer DEFAULT 0 NOT NULL,
	`processed_docs` integer DEFAULT 0 NOT NULL,
	`total_attachments` integer DEFAULT 0 NOT NULL,
	`processed_attachments` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`errors` text,
	`file_key` text,
	`lark_config` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_import_jobs_tenant` ON `import_jobs` (`tenant_id`);--> statement-breakpoint
CREATE INDEX `idx_import_jobs_status` ON `import_jobs` (`status`);