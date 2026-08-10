import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { QUERY_KEYS } from '@/lib/constants';
import { timeAgo } from '@/lib/format';
import type { NotificationItem } from '@/lib/types';
import { Dropdown } from '@/ui/Dropdown';

export function NotificationsBell() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: QUERY_KEYS.notifications,
    queryFn: () => api.get<{ notifications: NotificationItem[]; unread: number }>('/admin/notifications'),
    refetchInterval: 60_000,
  });

  const unread = data?.unread ?? 0;

  async function markAllRead() {
    await api.post('/admin/notifications/read-all');
    queryClient.invalidateQueries({ queryKey: QUERY_KEYS.notifications });
  }

  return (
    <Dropdown
      trigger={() => (
        <button className="icon-btn" aria-label="Notifications" style={{ position: 'relative', width: 34, height: 34 }}>
          <Bell size={17} />
          {unread > 0 && (
            <span
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                minWidth: 15,
                height: 15,
                borderRadius: 8,
                background: 'var(--color-danger)',
                color: '#fff',
                fontSize: 9.5,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 3px',
              }}
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div style={{ width: 340 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderBottom: '1px solid var(--color-border)' }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                style={{ border: 'none', background: 'transparent', color: 'var(--color-primary)', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <CheckCheck size={13} /> Mark all read
              </button>
            )}
          </div>
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {!data?.notifications.length ? (
              <div style={{ padding: '28px 16px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 12.5 }}>
                No notifications yet.
              </div>
            ) : (
              data.notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    close();
                    if (n.link) navigate(n.link);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    border: 'none',
                    borderBottom: '1px solid var(--color-border)',
                    background: n.read ? 'transparent' : 'var(--color-primary-soft)',
                    cursor: n.link ? 'pointer' : 'default',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--color-text)' }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginTop: 2 }}>{n.body}</div>}
                  <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>{timeAgo(n.created_at)}</div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </Dropdown>
  );
}
