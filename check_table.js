import { createClient } from '@supabase/supabase-js';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
async function check() {
  const { data, error } = await supabase.from('catalog_items').select('id, image_url').limit(1);
  console.log('Data:', data);
  console.log('Error:', error);
}
check();
