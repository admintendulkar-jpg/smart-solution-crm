import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Building2, Phone, Mail, ShieldCheck, Info } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { Button } from '@/ui/Button';
import { Field, Input } from '@/ui/Fields';
import { useToast } from '@/ui/Toast';
import { isValidPhone } from '@/lib/format';

const RESEND_COOLDOWN = 30;

export function LoginPage() {
  const toast = useToast();

  const [identifierType, setIdentifierType] = useState<'phone' | 'email'>('phone');
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'identifier' | 'otp'>('identifier');
  const [cooldown, setCooldown] = useState(0);
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [otpError, setOtpError] = useState<string | undefined>();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const requestOtp = useMutation({
    mutationFn: () => api.post<{ success: boolean; message: string }>('/auth/request-otp', { identifier, identifierType }),
    onSuccess: (data) => {
      toast.success(data.message);
      setStep('otp');
      setOtp('');
      setOtpError(undefined);
      setCooldown(RESEND_COOLDOWN);
    },
    onError: (err) => setFieldError(errorMessage(err)),
  });

  const verifyOtp = useMutation({
    mutationFn: () => api.post<{ user: { role: string }; success: boolean }>('/auth/verify-otp', { identifier, otp }),
    onSuccess: (data) => {
      toast.success('Welcome back.');
      const role = data.user?.role;
      if (role === 'sales') window.location.assign('/leads');
      else if (role === 'service') window.location.assign('/clients');
      else if (role === 'hr') window.location.assign('/hr/dashboard');
      else window.location.assign('/dashboard');
    },
    onError: (err) => setOtpError(errorMessage(err)),
  });

  function submitIdentifier(e: React.FormEvent) {
    e.preventDefault();
    setFieldError(undefined);
    if (identifierType === 'phone' && !isValidPhone(identifier)) {
      setFieldError('Enter a valid 10-digit mobile number.');
      return;
    }
    if (identifierType === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(identifier)) {
      setFieldError('Enter a valid email address.');
      return;
    }
    requestOtp.mutate();
  }

  function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    setOtpError(undefined);
    if (!/^\d{6}$/.test(otp)) {
      setOtpError('Enter the 6-digit code.');
      return;
    }
    verifyOtp.mutate();
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--color-bg)',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 420,
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div style={{ padding: '28px 32px 8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 9,
                background: 'var(--color-primary)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Building2 size={20} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>Smart Solution Agency</div>
              <div style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Internal CRM</div>
            </div>
          </div>
          <h1 style={{ fontSize: 19, marginBottom: 4 }}>Sign in</h1>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Use your registered mobile number or work email.</p>
        </div>

        <form style={{ padding: '16px 32px 28px' }} onSubmit={step === 'identifier' ? submitIdentifier : submitOtp}>
          {step === 'identifier' ? (
            <>
              <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                <Button variant={identifierType === 'phone' ? 'primary' : 'secondary'} size="sm" onClick={() => { setIdentifierType('phone'); setFieldError(undefined); }} icon={<Phone size={13} />}>
                  Phone
                </Button>
                <Button variant={identifierType === 'email' ? 'primary' : 'secondary'} size="sm" onClick={() => { setIdentifierType('email'); setFieldError(undefined); }} icon={<Mail size={13} />}>
                  Email
                </Button>
              </div>
              <Field label={identifierType === 'phone' ? 'Mobile number' : 'Work email'} error={fieldError}>
                <Input
                  autoFocus
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={identifierType === 'phone' ? '10-digit mobile number' : 'name@company.com'}
                  inputMode={identifierType === 'phone' ? 'tel' : 'email'}
                  autoComplete="username"
                />
              </Field>
              <div style={{ marginTop: 18 }}>
                <Button type="submit" block loading={requestOtp.isPending}>
                  Send OTP
                </Button>
              </div>
            </>
          ) : (
            <>
              <Field label={`Enter the 6-digit code sent to ${identifier}`} error={otpError}>
                <Input
                  autoFocus
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="••••••"
                  inputMode="numeric"
                  style={{ letterSpacing: 8, fontSize: 16, fontWeight: 600 }}
                />
              </Field>
              <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <Button variant="ghost" size="sm" disabled={cooldown > 0 || requestOtp.isPending} onClick={() => requestOtp.mutate()}>
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend OTP'}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setStep('identifier')}>
                  Change number
                </Button>
              </div>
              <div style={{ marginTop: 14 }}>
                <Button type="submit" block loading={verifyOtp.isPending}>
                  Verify & Sign in
                </Button>
              </div>
            </>
          )}

          <div
            className="alert alert-info"
            style={{ marginTop: 20, fontSize: 12, lineHeight: 1.5 }}
          >
            <ShieldCheck size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              OTPs expire in 10 minutes. Security policy locks the account for 15 minutes after 3 wrong attempts.
            </span>
          </div>
          <div className="alert" style={{ marginTop: 10, fontSize: 12, lineHeight: 1.5, background: 'var(--color-grey-bg)', color: 'var(--color-text-secondary)' }}>
            <Info size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Demo environment: the OTP is <strong>123456</strong> for every account.
            </span>
          </div>
        </form>
      </div>
    </div>
  );
}
