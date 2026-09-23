export interface UserProfile {
  display_name: string | null;
  plan_key: string;
  created_at: string;
}

export interface UserPreferences {
  output_language: string;
  privacy_mode: string;
  default_text_template: string | null;
  default_voice_template: string | null;
  default_document_template: string | null;
}
