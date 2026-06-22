const SUPABASE_URL =
  "https://fprdwrxqeqfvempkqmdw.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_WcEW34dkzX1habpDWF9Xwg_7JTyXXIP";

if (
  !window.__techparkSupabase
) {

  console.log(
    "Criando Supabase Client"
  );

  window.__techparkSupabase =
    window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    );
}

const supabaseClient =
  window.__techparkSupabase;