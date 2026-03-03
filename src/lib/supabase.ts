import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://xggmvwxcgbaosuiefgzf.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhnZ212d3hjZ2Jhb3N1aWVmZ3pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1NDIxMDIsImV4cCI6MjA4ODExODEwMn0.nC2Ag_R9vjdA_EK_sk9BUC2O2WRuuoBgWP3uhhx0Z4s';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
