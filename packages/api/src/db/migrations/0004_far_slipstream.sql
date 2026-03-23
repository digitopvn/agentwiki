CREATE TABLE `document_similarities` (
	`id` text PRIMARY KEY NOT NULL,
	`source_doc_id` text NOT NULL,
	`target_doc_id` text NOT NULL,
	`score` real NOT NULL,
	`computed_at` integer NOT NULL,
	FOREIGN KEY (`source_doc_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_doc_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_similarities_source` ON `document_similarities` (`source_doc_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_similarities_pair` ON `document_similarities` (`source_doc_id`,`target_doc_id`);--> statement-breakpoint
ALTER TABLE `document_links` ADD `type` text DEFAULT 'relates-to' NOT NULL;--> statement-breakpoint
ALTER TABLE `document_links` ADD `weight` real DEFAULT 1;--> statement-breakpoint
ALTER TABLE `document_links` ADD `inferred` integer DEFAULT 0;