import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Get these from: Supabase Dashboard → Project Settings → API
const SUPABASE_URL = 'https://xoalpqtzfivdsurlitry.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hIZelVT465w803NGV5OJVg_r3tnv-2Q';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
