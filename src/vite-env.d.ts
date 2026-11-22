/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Supabase project (phase 5). Both missing = the game runs offline as a guest only.
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  // Online game server (phase 6), e.g. wss://<app>.fly.dev. Missing = online play not configured.
  readonly VITE_GAME_SERVER_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
