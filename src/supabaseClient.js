import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://izbjadizahqlfrdqofyw.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml6YmphZGl6YWhxbGZyZHFvZnl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQyMDE1OTksImV4cCI6MjA2OTc3NzU5OX0.sCoMYav2kGtopZsmijAJojBgoN_ay-ddAVYT3I-l6o0';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
