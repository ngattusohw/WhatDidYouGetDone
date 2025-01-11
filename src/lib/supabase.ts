import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const env = import.meta.env.VITE_ENV;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
	auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Helper function for Edge Functions URLs

const baseUrl =
  env === 'development'
    ? 'http://127.0.0.1:54321'
    : supabaseUrl;
export const getFunctionsUrl = (functionPath: string) => {
  return `${baseUrl}/functions/v1/${functionPath}`;
};