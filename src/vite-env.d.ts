/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Supabase project (phase 5). Both missing = the game runs offline as a guest only.
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
