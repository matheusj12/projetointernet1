import { supabase } from './supabase';

export async function logActivity(
    userId: string,
    action: 'create' | 'update' | 'delete',
    entityType: string,
    entityId: string,
    details?: Record<string, unknown>
) {
    await supabase.from('activity_log').insert({
        user_id: userId,
        action,
        entity_type: entityType,
        entity_id: entityId,
        details: details || {},
    });
}
