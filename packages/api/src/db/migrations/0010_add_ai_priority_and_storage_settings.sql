ALTER TABLE `ai_settings` ADD `priority` integer NOT NULL DEFAULT 0;--> statement-breakpoint
CREATE TABLE `storage_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL UNIQUE REFERENCES `tenants`(`id`),
	`account_id` text NOT NULL,
	`encrypted_access_key` text NOT NULL,
	`encrypted_secret_key` text NOT NULL,
	`bucket_name` text NOT NULL,
	`endpoint_url` text,
	`is_verified` integer NOT NULL DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
