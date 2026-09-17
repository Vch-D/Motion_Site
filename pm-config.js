// Backend of the Project Manager. These two values are PUBLIC by design (Supabase publishable key):
// access to data is limited by row-level security in supabase/schema.sql.
// Leave this object empty to run the manager in local demo mode (data stays in the browser).
window.PM_CONFIG = {
  supabaseUrl: 'https://ytfhunghgfcddsxxhyow.supabase.co',
  supabaseKey: 'sb_publishable_7GHatH7vNgT3_qudftEpww_qSeC5j-g',
};
