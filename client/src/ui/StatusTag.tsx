import { STATUS_META } from '@/lib/constants';

export function StatusTag({ status, showLabel = true }: { status: string; showLabel?: boolean }) {
  const meta = STATUS_META[status] ?? STATUS_META.New;
  return (
    <span className="status-tag" style={{ color: meta.label }}>
      <span className="dot" style={{ background: meta.dot }} />
      {showLabel && status}
    </span>
  );
}
