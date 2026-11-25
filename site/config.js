// Where the website reads the stats. On GitHub this file is written by the "Update website" workflow
// from the repository variables SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (see README.md).
// The publishable key may be public: with it, the stats can only be read, never changed.
// NEVER put the secret key here.
window.SITE_CONFIG = {
  supabaseUrl: "",
  supabaseKey: "",
  serverName: "",
  serverAddress: "",
};
