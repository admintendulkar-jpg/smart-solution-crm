import { AlertTriangle } from 'lucide-react';
import { errorMessage } from '@/lib/api';
import { Button } from './Button';

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div style={{ padding: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, textAlign: 'center' }}>
      <div className="empty-icon">
        <AlertTriangle size={20} />
      </div>
      <div style={{ fontSize: 14, fontWeight: 600 }}>Could not load data</div>
      <div style={{ fontSize: 12.5, color: 'var(--color-text-muted)', maxWidth: 360 }}>{errorMessage(error)}</div>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry} style={{ marginTop: 6 }}>
          Try again
        </Button>
      )}
    </div>
  );
}
