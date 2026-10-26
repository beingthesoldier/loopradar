// Where the site's accounts live. Fill both from Supabase: Project Settings → API
// (the Project URL, and the publishable key, or the legacy "anon public" key).
// Both are meant to be public: what each visitor may read or change is enforced in the database
// by row-level security (supabase/schema.sql). Never put the secret / service_role key here.
// Left empty, the site works as before and the account menu says accounts are coming soon.
export const SUPABASE_URL = '';
export const SUPABASE_ANON_KEY = '';
