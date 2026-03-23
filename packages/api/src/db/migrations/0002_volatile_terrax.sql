CREATE TABLE `search_analytics` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`query` text NOT NULL,
	`search_type` text NOT NULL,
	`result_count` integer NOT NULL,
	`clicked_doc_id` text,
	`click_position` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_analytics_tenant_date` ON `search_analytics` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_analytics_tenant_query` ON `search_analytics` (`tenant_id`,`query`);--> statement-breakpoint
CREATE TABLE `search_history` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`query` text NOT NULL,
	`result_count` integer NOT NULL,
	`search_count` integer DEFAULT 1 NOT NULL,
	`last_searched_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_history_tenant_query` ON `search_history` (`tenant_id`,`query`);--> statement-breakpoint
CREATE TABLE `search_trigrams` (
	`trigram` text NOT NULL,
	`document_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`field` text NOT NULL,
	`frequency` integer DEFAULT 1 NOT NULL,
	PRIMARY KEY(`trigram`, `document_id`, `field`),
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_trigram_tenant` ON `search_trigrams` (`trigram`,`tenant_id`);