/**
 * supabase.js — Supabase client initialization.
 * Creates and exports a single Supabase client instance using the
 * VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY environment variables.
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
