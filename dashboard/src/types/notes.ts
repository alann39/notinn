export interface Note {
  id: string;
  title: string;
  source_type: string;
  language: string | null;
  is_saved: boolean;
  created_at: string;
  updated_at: string;
  tags: string[];
  template_key: string;
  summary?: string;
  output_id?: string;
  output_content_json?: StructuredNote;
  output_rendered_text?: string;
  output_template_key?: string;
  output_provider?: string;
  output_model?: string;
  output_generation_reason?: string;
  output_created_at?: string;
  current_output?: NoteOutput;
}

export interface NoteOutput {
  id: string;
  template_key: string;
  schema_version: number;
  content_json: StructuredNote;
  rendered_text: string;
  provider: string;
  model: string;
  generation_reason: string;
  created_at: string;
}

export interface StructuredNote {
  title: string;
  summary: string;
  key_points: string[];
  action_items: ActionItem[];
  decisions?: string[];
  uncertainties?: string[];
  tags: string[];
  language: string;
  confidence?: number;
  sections: Section[];
  source_references: SourceReference[];
}

export interface ActionItem {
  text?: string;
  task?: string;
  assignee?: string | null;
  owner?: string | null;
  due_date?: string | null;
  due_date_text?: string | null;
  due_date_iso?: string | null;
  priority?: string | null;
  confidence?: number;
}

export interface Section {
  heading: string;
  body?: string;
  content?: string;
}

export interface SourceReference {
  title?: string | null;
  type?: string;
  value?: string;
  url?: string | null;
  page?: string | null;
}
