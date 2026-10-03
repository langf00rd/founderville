// Paste the values from Supabase → Project Settings → API.
// The anon key is safe to ship in a static bundle: it only works alongside the
// row level security policies in docs/schema.sql.
window.FG_CONFIG = {
  url: "https://vfprwxgzalvqijgcnfox.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmcHJ3eGd6YWx2cWlqZ2NuZm94Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NjQ0MTEsImV4cCI6MjA4NjE0MDQxMX0.v-zsrkjb1MevlBlpmmFgxfpAnUYvr9C4UOQWK161mjY",
  // Empty means "whatever page you're on". Must be allowlisted under
  // Supabase → Authentication → URL Configuration → Redirect URLs.
  redirectTo: "",
  // Only list providers that are actually switched on in Supabase
  // (Authentication → Providers), or the button will fail.
  providers: ["github"],
  // false lets you play and test without signing in. Keep true in production.
  authRequired: true,
};
