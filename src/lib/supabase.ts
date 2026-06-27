import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseUrl = "";
let supabaseAnonKey = "";

export function initSupabaseKeys(url: string, key: string) {
  if (url && key) {
    supabaseUrl = url;
    supabaseAnonKey = key;
    if (!supabaseInstance) {
      supabaseInstance = createClient(url, key);
    }
  }
}

// Helper to check if Supabase is configured
export function getSupabaseKeys() {
  const meta = import.meta as any;
  const url = supabaseUrl || meta.env?.VITE_SUPABASE_URL || "";
  const key = supabaseAnonKey || meta.env?.VITE_SUPABASE_ANON_KEY || "";
  return { url, key, isConfigured: !!(url && key) };
}

let supabaseInstance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const { url, key, isConfigured } = getSupabaseKeys();
  if (!isConfigured) return null;
  
  if (!supabaseInstance) {
    supabaseInstance = createClient(url, key);
  }
  return supabaseInstance;
}

// Interface representing the profile table
export interface ProfileRow {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  style_dna: string | null;
  updated_at: string | null;
  scan_credits: number;
  batch_credits: number;
  is_premium: boolean;
  message_count: number;
}
