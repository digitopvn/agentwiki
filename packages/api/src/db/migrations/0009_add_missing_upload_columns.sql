ALTER TABLE `uploads` ADD `last_dispatched_at` integer;--> statement-breakpoint
ALTER TABLE `file_extractions` ADD `chunk_count` integer DEFAULT 0;