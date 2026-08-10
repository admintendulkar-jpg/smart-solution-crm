import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/auth/auth';
import { api } from '@/lib/api';
import type { Lead } from '@/lib/types';
import { useToast } from '@/ui/Toast';

const STORAGE_KEY = 'sscrm_followup_notified';
const POLL_MS = 60_000;
const OVERDUE_WINDOW_MS = 30 * 60_000;

function readNotified(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? (JSON.parse(raw) as number[]) : []);
  } catch {
    return new Set();
  }
}

function persistNotified(set: Set<number>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // storage unavailable — notifications still work for this session
  }
}

export function FollowUpReminder() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!user || user.role !== 'sales') return;

    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission();
    }

    let cancelled = false;
    const notified = readNotified();

    async function check(): Promise<void> {
      if (cancelled) return;
      let leads: Lead[] = [];
      try {
        const res = await api.get<{ leads: Lead[] }>('/leads/mine?status=Follow-up');
        leads = res.leads;
      } catch {
        return;
      }

      const now = Date.now();
      const windowStart = now - OVERDUE_WINDOW_MS;
      const due: Lead[] = [];

      for (const lead of leads) {
        if (!lead.follow_up_at) continue;
        const dueAt = new Date(lead.follow_up_at).getTime();
        if (Number.isNaN(dueAt)) continue;
        if (dueAt <= now && dueAt >= windowStart) {
          due.push(lead);
        }
      }

      const next = new Set<number>();
      for (const lead of due) {
        next.add(lead.id);
        if (notified.has(lead.id)) continue;
        notified.add(lead.id);
        const message = `⏰ Reminder: Call ${lead.name} now`;
        toast(message);
        if ('Notification' in window && Notification.permission === 'granted') {
          const n = new Notification('Follow-up due', {
            body: `${lead.service} · ${lead.phone}`,
            tag: `followup-${lead.id}`,
          });
          n.onclick = () => {
            n.close();
            window.focus();
            navigate(`/leads/${lead.id}`);
          };
        }
      }
      persistNotified(next);
    }

    void check();
    const interval = window.setInterval(() => void check(), POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [user, navigate, toast]);

  return null;
}
