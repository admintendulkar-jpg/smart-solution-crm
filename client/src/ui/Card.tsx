import type { CSSProperties, ReactNode } from 'react';

export function Card({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`card ${className}`} style={style}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="card-header">
      <div>
        <div className="card-title">{title}</div>
        {subtitle && <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: 2 }}>{subtitle}</div>}
      </div>
      {actions}
    </div>
  );
}

export function CardBody({ children, padded = true }: { children: ReactNode; padded?: boolean }) {
  return <div className={padded ? 'card-body' : undefined}>{children}</div>;
}
