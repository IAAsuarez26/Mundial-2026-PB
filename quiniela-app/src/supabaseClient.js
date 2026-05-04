import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ivxvatmhgttcmyrqctos.supabase.co'
const supabaseAnonKey = 'sb_publishable_0AsGK4JBvD-IzmOsyj2AwQ_aQ94N0KK'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
