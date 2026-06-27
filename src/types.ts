export interface PhysicalTraits {
  skin_color: string;
  skin_undertone: string;
  hair_type: string;
  hair_color: string;
  bone_structure?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface StylistState {
  user_id: string;
  message_count: number;
  requires_paywall: boolean;
  detected_vibe: string;
  physical_traits: PhysicalTraits;
  onboarding_step: number;
  messages: ChatMessage[];
  is_unlocked: boolean;
}

export interface APIResponse {
  state: StylistState;
  text: string;
  typing_delay?: number;
}
