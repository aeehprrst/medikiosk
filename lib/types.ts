export type Language = 'hi' | 'en' | 'ta';
export type Mode = 'allopathic' | 'ayush';
export type UIType =
  | 'voice_open'
  | 'single_choice'
  | 'multi_choice'
  | 'scale'
  | 'yes_no'
  | 'body_map';
export type Severity = 'critical' | 'urgent' | 'advisory';

export interface Question {
  id: string;
  section: string;
  text_en: string;
  text_localized: string;
  ui_type: UIType;
  options?: Option[];
  allow_voice: boolean;
  allow_skip: boolean;
}

export interface Option {
  value: string;
  label_en: string;
  label_localized: string;
  icon: string; // lucide-react icon name — required by NFR-A4
}

export interface RedFlag {
  code: string;
  severity: Severity;
  label: string;
  triggered_by: 'deterministic' | 'llm';
}
