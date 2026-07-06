import { createClient, SupabaseClient } from "@supabase/supabase-js";

const HARDCODED_SUPABASE_URL = "https://xhsxktsnmrrsxcmouqki.supabase.co";
const HARDCODED_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhoc3hrdHNubXJyc3hjbW91cWtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3NDUwNzcsImV4cCI6MjA5MzMyMTA3N30.A-ja-yPnlFT3zMP5ew7HSYETN4-5aiClLyW1YXYWDfA";

let supabaseUrl = HARDCODED_SUPABASE_URL;
let supabaseAnonKey = HARDCODED_SUPABASE_ANON_KEY;

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
  const url = supabaseUrl || HARDCODED_SUPABASE_URL || meta.env?.VITE_SUPABASE_URL || "";
  const key = supabaseAnonKey || HARDCODED_SUPABASE_ANON_KEY || meta.env?.VITE_SUPABASE_ANON_KEY || "";
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

/**
 * RFC4122 compliant UUID structure helper
 */
export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Pseudo-UUID deterministic translations to map custom sandbox identifiers safely to standard UUID formatting
 */
export function getSafeUUID(rawId: string): string {
  const clean = rawId.trim();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean)) {
    return clean;
  }
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = clean.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hex = Math.abs(hash).toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${hex.substring(0, 12)}`;
}
