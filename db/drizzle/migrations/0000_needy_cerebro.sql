CREATE TABLE "context_paging_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"project_id" uuid,
	"user_id" uuid,
	"loaded_memory_ids" text[] DEFAULT '{}',
	"preload_candidate_ids" text[] DEFAULT '{}',
	"token_budget" integer DEFAULT 8000 NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"loaded_memories_tokens" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "context_paging_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "context_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"project_id" uuid,
	"user_id" uuid,
	"loaded_memory_ids" text[] DEFAULT '{}',
	"token_budget" integer DEFAULT 8000 NOT NULL,
	"tokens_used" integer DEFAULT 0 NOT NULL,
	"core_memory_tokens" integer DEFAULT 0 NOT NULL,
	"loaded_memories_tokens" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "context_sessions_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"user_id" uuid,
	"session_id" text NOT NULL,
	"title" text,
	"summary" text,
	"message_count" integer DEFAULT 0,
	"token_count" integer DEFAULT 0,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "core_memory" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"user_id" uuid,
	"section" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"tokens_estimate" integer DEFAULT 0 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"description" text,
	"embedding" vector(1536),
	"properties" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entity_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_entity_id" uuid NOT NULL,
	"to_entity_id" uuid NOT NULL,
	"type" text NOT NULL,
	"weight" integer DEFAULT 1,
	"properties" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lightweight_memory_indices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" uuid,
	"content_hash" text NOT NULL,
	"content_preview" text NOT NULL,
	"key_terms" text[],
	"category" text NOT NULL,
	"importance_score" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"user_id" uuid,
	"type" text NOT NULL,
	"content" text NOT NULL,
	"summary" text,
	"embedding" vector(1536),
	"source" text,
	"confidence" integer DEFAULT 100,
	"tags" text[],
	"metadata" jsonb,
	"is_private" boolean DEFAULT false,
	"has_secrets" boolean DEFAULT false,
	"relevance_score" integer DEFAULT 50,
	"sector" text DEFAULT 'episodic',
	"tier" text DEFAULT 'hot',
	"decay_rate" integer DEFAULT 30,
	"coactivation_score" integer DEFAULT 0,
	"last_decay_at" timestamp DEFAULT now(),
	"agent_id" text,
	"agent_role" text,
	"visibility_scope" text DEFAULT 'private',
	"is_protected" boolean DEFAULT false,
	"is_pinned" boolean DEFAULT false,
	"is_immutable" boolean DEFAULT false,
	"write_scope" text[],
	"read_scope" text[],
	"triggered_by" text,
	"capture_reason" text,
	"last_used_at" timestamp,
	"usage_count" integer DEFAULT 0,
	"valid_from" timestamp,
	"valid_to" timestamp,
	"recorded_at" timestamp DEFAULT now() NOT NULL,
	"superseded_by" uuid,
	"version" integer DEFAULT 1,
	"is_active" boolean DEFAULT true,
	"expires_at" timestamp,
	"access_count" integer DEFAULT 0,
	"last_accessed_at" timestamp,
	"is_merged" boolean DEFAULT false,
	"merged_into_id" uuid,
	"merged_at" timestamp,
	"is_canonical" boolean DEFAULT false,
	"merge_source_ids" jsonb,
	"is_mergeable" boolean DEFAULT true,
	"merge_version" integer DEFAULT 1,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_associations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_memory_id" uuid NOT NULL,
	"to_memory_id" uuid NOT NULL,
	"association_type" text NOT NULL,
	"weight" integer DEFAULT 1,
	"coactivation_count" integer DEFAULT 0,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"last_coactivated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "memory_edit_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid,
	"memory_id" uuid NOT NULL,
	"current_content" text NOT NULL,
	"proposed_content" text NOT NULL,
	"reason" text NOT NULL,
	"conflict_warnings" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_at" timestamp,
	"review_notes" text
);
--> statement-breakpoint
CREATE TABLE "memory_hash_cache" (
	"memory_id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"simhash" text,
	"minhash" jsonb,
	"content_hash" text NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_merge_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid,
	"proposal_id" uuid,
	"source_memory_ids" jsonb NOT NULL,
	"canonical_memory_id" uuid NOT NULL,
	"source_memories_snapshot" jsonb NOT NULL,
	"merge_strategy" text NOT NULL,
	"tokens_saved" integer,
	"is_reversed" boolean DEFAULT false,
	"reversed_at" timestamp,
	"reversed_by" uuid,
	"merged_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_merge_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"user_id" uuid,
	"source_memory_ids" jsonb NOT NULL,
	"proposed_content" text NOT NULL,
	"proposed_summary" text,
	"proposed_tags" jsonb,
	"proposed_metadata" jsonb,
	"detection_method" text NOT NULL,
	"similarity_score" numeric NOT NULL,
	"confidence_level" text NOT NULL,
	"merge_reason" text NOT NULL,
	"conflict_warnings" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_at" timestamp,
	"review_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "memory_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" uuid NOT NULL,
	"snapshot_type" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"diff" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"embedding" vector(1536),
	"token_count" integer,
	"tool_calls" jsonb,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid,
	"conversation_id" uuid,
	"type" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"summary" text NOT NULL,
	"details" jsonb,
	"embedding" vector(1536),
	"folder_path" text,
	"project_path" text,
	"is_private" boolean DEFAULT false,
	"has_secrets" boolean DEFAULT false,
	"relevance_score" integer DEFAULT 50,
	"category" text,
	"importance" integer DEFAULT 50,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"path" text NOT NULL,
	"description" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"project_id" uuid,
	"summary_type" text NOT NULL,
	"content" text NOT NULL,
	"compressed_from" integer,
	"tokens_saved" integer,
	"embedding" vector(1536),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_id" text,
	"name" text,
	"email" text,
	"preferences" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
ALTER TABLE "context_paging_sessions" ADD CONSTRAINT "context_paging_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_paging_sessions" ADD CONSTRAINT "context_paging_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_sessions" ADD CONSTRAINT "context_sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_sessions" ADD CONSTRAINT "context_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_memory" ADD CONSTRAINT "core_memory_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "core_memory" ADD CONSTRAINT "core_memory_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relations" ADD CONSTRAINT "entity_relations_from_entity_id_entities_id_fk" FOREIGN KEY ("from_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entity_relations" ADD CONSTRAINT "entity_relations_to_entity_id_entities_id_fk" FOREIGN KEY ("to_entity_id") REFERENCES "public"."entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lightweight_memory_indices" ADD CONSTRAINT "lightweight_memory_indices_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_superseded_by_memories_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."memories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memories" ADD CONSTRAINT "memories_merged_into_id_memories_id_fk" FOREIGN KEY ("merged_into_id") REFERENCES "public"."memories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_associations" ADD CONSTRAINT "memory_associations_from_memory_id_memories_id_fk" FOREIGN KEY ("from_memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_associations" ADD CONSTRAINT "memory_associations_to_memory_id_memories_id_fk" FOREIGN KEY ("to_memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_edit_proposals" ADD CONSTRAINT "memory_edit_proposals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_edit_proposals" ADD CONSTRAINT "memory_edit_proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_edit_proposals" ADD CONSTRAINT "memory_edit_proposals_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_hash_cache" ADD CONSTRAINT "memory_hash_cache_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_hash_cache" ADD CONSTRAINT "memory_hash_cache_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_merge_history" ADD CONSTRAINT "memory_merge_history_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_merge_history" ADD CONSTRAINT "memory_merge_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_merge_history" ADD CONSTRAINT "memory_merge_history_proposal_id_memory_merge_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."memory_merge_proposals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_merge_history" ADD CONSTRAINT "memory_merge_history_canonical_memory_id_memories_id_fk" FOREIGN KEY ("canonical_memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_merge_proposals" ADD CONSTRAINT "memory_merge_proposals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_merge_proposals" ADD CONSTRAINT "memory_merge_proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_snapshots" ADD CONSTRAINT "memory_snapshots_memory_id_memories_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD CONSTRAINT "session_summaries_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_summaries" ADD CONSTRAINT "session_summaries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "context_paging_session_idx" ON "context_paging_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "context_paging_project_idx" ON "context_paging_sessions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "context_paging_created_idx" ON "context_paging_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "context_sessions_session_idx" ON "context_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "context_sessions_project_idx" ON "context_sessions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "context_sessions_created_idx" ON "context_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "conversations_project_idx" ON "conversations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "conversations_session_idx" ON "conversations" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "conversations_started_idx" ON "conversations" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "core_memory_project_idx" ON "core_memory" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "core_memory_user_idx" ON "core_memory" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "core_memory_section_idx" ON "core_memory" USING btree ("section");--> statement-breakpoint
CREATE INDEX "entities_project_idx" ON "entities" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "entities_type_idx" ON "entities" USING btree ("type");--> statement-breakpoint
CREATE INDEX "entities_name_idx" ON "entities" USING btree ("name");--> statement-breakpoint
CREATE INDEX "relations_from_idx" ON "entity_relations" USING btree ("from_entity_id");--> statement-breakpoint
CREATE INDEX "relations_to_idx" ON "entity_relations" USING btree ("to_entity_id");--> statement-breakpoint
CREATE INDEX "relations_type_idx" ON "entity_relations" USING btree ("type");--> statement-breakpoint
CREATE INDEX "lightweight_indices_memory_idx" ON "lightweight_memory_indices" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "lightweight_indices_category_idx" ON "lightweight_memory_indices" USING btree ("category");--> statement-breakpoint
CREATE INDEX "lightweight_indices_importance_idx" ON "lightweight_memory_indices" USING btree ("importance_score");--> statement-breakpoint
CREATE INDEX "memories_project_idx" ON "memories" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "memories_type_idx" ON "memories" USING btree ("type");--> statement-breakpoint
CREATE INDEX "memories_created_idx" ON "memories" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "memories_tags_idx" ON "memories" USING btree ("tags");--> statement-breakpoint
CREATE INDEX "memories_relevance_idx" ON "memories" USING btree ("relevance_score");--> statement-breakpoint
CREATE INDEX "memories_private_idx" ON "memories" USING btree ("is_private");--> statement-breakpoint
CREATE INDEX "memories_merged_idx" ON "memories" USING btree ("is_merged");--> statement-breakpoint
CREATE INDEX "memories_canonical_idx" ON "memories" USING btree ("is_canonical");--> statement-breakpoint
CREATE INDEX "memories_sector_idx" ON "memories" USING btree ("sector");--> statement-breakpoint
CREATE INDEX "memories_tier_idx" ON "memories" USING btree ("tier");--> statement-breakpoint
CREATE INDEX "memories_agent_idx" ON "memories" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "memories_visibility_idx" ON "memories" USING btree ("visibility_scope");--> statement-breakpoint
CREATE INDEX "memories_protected_idx" ON "memories" USING btree ("is_protected");--> statement-breakpoint
CREATE INDEX "memories_pinned_idx" ON "memories" USING btree ("is_pinned");--> statement-breakpoint
CREATE INDEX "memories_valid_from_idx" ON "memories" USING btree ("valid_from");--> statement-breakpoint
CREATE INDEX "memories_valid_to_idx" ON "memories" USING btree ("valid_to");--> statement-breakpoint
CREATE INDEX "memories_duplicate_detection_idx" ON "memories" USING btree ("project_id","is_merged","is_mergeable","is_active");--> statement-breakpoint
CREATE INDEX "memories_eviction_idx" ON "memories" USING btree ("project_id","tier","relevance_score","created_at");--> statement-breakpoint
CREATE INDEX "memories_decay_idx" ON "memories" USING btree ("sector","last_decay_at","is_protected");--> statement-breakpoint
CREATE INDEX "memories_temporal_idx" ON "memories" USING btree ("project_id","valid_from","valid_to");--> statement-breakpoint
CREATE INDEX "memories_agent_visibility_idx" ON "memories" USING btree ("agent_id","visibility_scope","is_active");--> statement-breakpoint
CREATE INDEX "associations_from_idx" ON "memory_associations" USING btree ("from_memory_id");--> statement-breakpoint
CREATE INDEX "associations_to_idx" ON "memory_associations" USING btree ("to_memory_id");--> statement-breakpoint
CREATE INDEX "associations_type_idx" ON "memory_associations" USING btree ("association_type");--> statement-breakpoint
CREATE INDEX "associations_weight_idx" ON "memory_associations" USING btree ("weight");--> statement-breakpoint
CREATE INDEX "associations_graph_traversal_idx" ON "memory_associations" USING btree ("from_memory_id","to_memory_id","weight","association_type");--> statement-breakpoint
CREATE INDEX "memory_edit_proposals_memory_idx" ON "memory_edit_proposals" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "memory_edit_proposals_status_idx" ON "memory_edit_proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "memory_edit_proposals_created_at_idx" ON "memory_edit_proposals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "memory_hash_cache_project_id_idx" ON "memory_hash_cache" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "memory_hash_cache_simhash_idx" ON "memory_hash_cache" USING btree ("simhash");--> statement-breakpoint
CREATE INDEX "memory_merge_proposals_project_status_idx" ON "memory_merge_proposals" USING btree ("project_id","status");--> statement-breakpoint
CREATE INDEX "memory_merge_proposals_created_at_idx" ON "memory_merge_proposals" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "snapshots_memory_idx" ON "memory_snapshots" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "snapshots_type_idx" ON "memory_snapshots" USING btree ("snapshot_type");--> statement-breakpoint
CREATE INDEX "snapshots_created_idx" ON "memory_snapshots" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "messages_role_idx" ON "messages" USING btree ("role");--> statement-breakpoint
CREATE INDEX "messages_created_idx" ON "messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "observations_project_idx" ON "observations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "observations_type_idx" ON "observations" USING btree ("type");--> statement-breakpoint
CREATE INDEX "observations_action_idx" ON "observations" USING btree ("action");--> statement-breakpoint
CREATE INDEX "observations_created_idx" ON "observations" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "observations_folder_idx" ON "observations" USING btree ("folder_path");--> statement-breakpoint
CREATE INDEX "observations_relevance_idx" ON "observations" USING btree ("relevance_score");--> statement-breakpoint
CREATE INDEX "observations_private_idx" ON "observations" USING btree ("is_private");--> statement-breakpoint
CREATE INDEX "projects_path_idx" ON "projects" USING btree ("path");--> statement-breakpoint
CREATE INDEX "session_summaries_conversation_idx" ON "session_summaries" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "session_summaries_project_idx" ON "session_summaries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "session_summaries_type_idx" ON "session_summaries" USING btree ("summary_type");