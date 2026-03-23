CREATE TABLE `ai_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`encrypted_api_key` text NOT NULL,
	`default_model` text NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `ai_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`model` text NOT NULL,
	`action` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `file_extractions` (
	`id` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`extracted_text` text NOT NULL,
	`char_count` integer DEFAULT 0,
	`vector_id` text,
	`extraction_method` text,
	`error_message` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`upload_id`) REFERENCES `uploads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_file_extractions_upload` ON `file_extractions` (`upload_id`);--> statement-breakpoint
CREATE INDEX `idx_file_extractions_tenant` ON `file_extractions` (`tenant_id`);--> statement-breakpoint
ALTER TABLE `uploads` ADD `extraction_status` text DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE `uploads` ADD `summary` text;