import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase.from('catalog_items').select('*').limit(1);
  console.log('Keys in table:', data && data[0] ? Object.keys(data[0]) : 'None');
  console.log('Error:', error);
}
check();
