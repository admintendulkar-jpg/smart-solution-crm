import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Building2, Phone, Mail, ShieldCheck, ArrowRight, Lock, KeyRound, Sparkles, CheckCircle2 } from 'lucide-react';
import { api, errorMessage } from '@/lib/api';
import { useToast } from '@/ui/Toast';
import { isValidPhone } from '@/lib/format';

const RESEND_COOLDOWN = 30;

export function LoginPage() {
  const toast = useToast();

  const [identifierType, setIdentifierType] = useState<'email' | 'phone'>('email');
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
      toast.success(data.message || 'OTP sent successfully!');
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
      toast.success('Welcome back! Logging you in...');
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
      setFieldError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (identifierType === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(identifier)) {
      setFieldError('Please enter a valid work email address.');
      return;
    }
    requestOtp.mutate();
  }

  function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    setOtpError(undefined);
    if (!/^\d{6}$/.test(otp)) {
      setOtpError('Please enter the 6-digit verification code.');
      return;
    }
    verifyOtp.mutate();
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100vw',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Background Decorative Glow Blobs */}
      <div
        style={{
          position: 'absolute',
          top: '-15%',
          left: '-10%',
          width: '500px',
          height: '500px',
          background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, rgba(0,0,0,0) 70%)',
          borderRadius: '50%',
          filter: 'blur(60px)',
          pointerEvents: 'none',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-15%',
          right: '-10%',
          width: '600px',
          height: '600px',
          background: 'radial-gradient(circle, rgba(168,85,247,0.2) 0%, rgba(0,0,0,0) 70%)',
          borderRadius: '50%',
          filter: 'blur(80px)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          width: '100%',
          maxWidth: '1020px',
          margin: '24px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          background: 'rgba(30, 41, 59, 0.75)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 30px rgba(99, 102, 241, 0.15)',
          overflow: 'hidden',
        }}
      >
        {/* Left Side: Brand & Feature Section */}
        <div
          style={{
            padding: '48px 40px',
            background: 'linear-gradient(180deg, rgba(99, 102, 241, 0.08) 0%, rgba(15, 23, 42, 0.4) 100%)',
            borderRight: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            {/* Logo Badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '32px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '14px',
                  background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                  boxShadow: '0 8px 20px rgba(99, 102, 241, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                }}
              >
                <Building2 size={26} />
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: '20px', color: '#f8fafc', letterSpacing: '-0.3px' }}>
                  Smart Solution
                </div>
                <div style={{ fontSize: '13px', color: '#a5b4fc', fontWeight: 500 }}>
                  Agency Management CRM
                </div>
              </div>
            </div>

            {/* Title & Subtitle */}
            <h1 style={{ fontSize: '30px', fontWeight: 700, color: '#ffffff', lineHeight: 1.25, marginBottom: '14px' }}>
              Streamline your leads, clients & team.
            </h1>
            <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.6, marginBottom: '32px' }}>
              Secure end-to-end portal for Sales Representatives, HR Managers, Service Agents, and Executive Leadership.
            </p>

            {/* Feature List */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {[
                'Real-time Lead & Conversion Tracking',
                'Client Projects & Payment Milestones',
                'HR Employee Records & Leave Management',
                'Role-Based Secure Multi-Portal Access',
              ].map((feature, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div
                    style={{
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      background: 'rgba(99, 102, 241, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#818cf8',
                      flexShrink: 0,
                    }}
                  >
                    <CheckCircle2 size={15} />
                  </div>
                  <span style={{ fontSize: '14px', color: '#cbd5e1', fontWeight: 500 }}>{feature}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Security Footer */}
          <div
            style={{
              marginTop: '40px',
              paddingTop: '20px',
              borderTop: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              color: '#64748b',
              fontSize: '12px',
            }}
          >
            <ShieldCheck size={16} color="#818cf8" />
            <span>256-bit Encrypted • Official Employee Portal</span>
          </div>
        </div>

        {/* Right Side: Login Form Card */}
        <div style={{ padding: '48px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ marginBottom: '24px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '20px',
                background: 'rgba(99, 102, 241, 0.15)',
                border: '1px solid rgba(99, 102, 241, 0.3)',
                color: '#a5b4fc',
                fontSize: '12px',
                fontWeight: 600,
                marginBottom: '12px',
              }}
            >
              <Sparkles size={13} />
              <span>Secure Authentication</span>
            </div>
            <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', marginBottom: '6px' }}>
              {step === 'identifier' ? 'Sign In to Your Account' : 'Verify One-Time Password'}
            </h2>
            <p style={{ fontSize: '13px', color: '#94a3b8' }}>
              {step === 'identifier'
                ? 'Enter your registered email address or mobile number.'
                : `We've sent a 6-digit verification code to ${identifier}`}
            </p>
          </div>

          <form onSubmit={step === 'identifier' ? submitIdentifier : submitOtp}>
            {step === 'identifier' ? (
              <>
                {/* Identifier Type Switcher Tabs */}
                <div
                  style={{
                    display: 'flex',
                    background: 'rgba(15, 23, 42, 0.6)',
                    padding: '4px',
                    borderRadius: '12px',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    marginBottom: '20px',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setIdentifierType('email');
                      setFieldError(undefined);
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      background: identifierType === 'email' ? '#4f46e5' : 'transparent',
                      color: identifierType === 'email' ? '#ffffff' : '#94a3b8',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <Mail size={15} /> Work Email
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIdentifierType('phone');
                      setFieldError(undefined);
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 14px',
                      borderRadius: '8px',
                      border: 'none',
                      background: identifierType === 'phone' ? '#4f46e5' : 'transparent',
                      color: identifierType === 'phone' ? '#ffffff' : '#94a3b8',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <Phone size={15} /> Phone Number
                  </button>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#cbd5e1', marginBottom: '8px' }}>
                    {identifierType === 'email' ? 'Registered Work Email' : 'Mobile Number'}
                  </label>
                  <div style={{ position: 'relative' }}>
                    <div
                      style={{
                        position: 'absolute',
                        left: '14px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      {identifierType === 'email' ? <Mail size={18} /> : <Phone size={18} />}
                    </div>
                    <input
                      autoFocus
                      type={identifierType === 'email' ? 'email' : 'tel'}
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={identifierType === 'email' ? 'name@smartsolutionagency.in' : '10-digit mobile number'}
                      style={{
                        width: '100%',
                        padding: '12px 14px 12px 42px',
                        borderRadius: '10px',
                        background: 'rgba(15, 23, 42, 0.8)',
                        border: fieldError ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.15)',
                        color: '#ffffff',
                        fontSize: '14px',
                        outline: 'none',
                        boxSizing: 'border-box',
                        transition: 'border-color 0.2s ease',
                      }}
                    />
                  </div>
                  {fieldError && (
                    <div style={{ color: '#f87171', fontSize: '12px', marginTop: '6px', fontWeight: 500 }}>
                      {fieldError}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={requestOtp.isPending}
                  style={{
                    width: '100%',
                    padding: '12px 20px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: requestOtp.isPending ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
                    transition: 'transform 0.1s ease, opacity 0.2s ease',
                    opacity: requestOtp.isPending ? 0.7 : 1,
                  }}
                >
                  {requestOtp.isPending ? 'Sending Verification Code...' : 'Get Verification Code'}
                  <ArrowRight size={16} />
                </button>
              </>
            ) : (
              <>
                {/* OTP Input Section */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#cbd5e1', marginBottom: '8px' }}>
                    Enter 6-Digit Verification Code
                  </label>
                  <div style={{ position: 'relative' }}>
                    <div
                      style={{
                        position: 'absolute',
                        left: '14px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                      }}
                    >
                      <KeyRound size={18} />
                    </div>
                    <input
                      autoFocus
                      type="text"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="••••••"
                      style={{
                        width: '100%',
                        padding: '12px 14px 12px 42px',
                        borderRadius: '10px',
                        background: 'rgba(15, 23, 42, 0.8)',
                        border: otpError ? '1px solid #ef4444' : '1px solid rgba(99, 102, 241, 0.5)',
                        color: '#ffffff',
                        fontSize: '18px',
                        fontWeight: 700,
                        letterSpacing: '8px',
                        textAlign: 'center',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  {otpError && (
                    <div style={{ color: '#f87171', fontSize: '12px', marginTop: '6px', fontWeight: 500 }}>
                      {otpError}
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                  <button
                    type="button"
                    disabled={cooldown > 0 || requestOtp.isPending}
                    onClick={() => requestOtp.mutate()}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: cooldown > 0 ? '#64748b' : '#818cf8',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: cooldown > 0 ? 'default' : 'pointer',
                      padding: 0,
                    }}
                  >
                    {cooldown > 0 ? `Resend Code in ${cooldown}s` : 'Resend Code'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('identifier');
                      setFieldError(undefined);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#94a3b8',
                      fontSize: '13px',
                      fontWeight: 500,
                      cursor: 'pointer',
                      padding: 0,
                      textDecoration: 'underline',
                    }}
                  >
                    Change Email/Phone
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={verifyOtp.isPending}
                  style={{
                    width: '100%',
                    padding: '12px 20px',
                    borderRadius: '10px',
                    border: 'none',
                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    color: '#ffffff',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: verifyOtp.isPending ? 'wait' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                    transition: 'transform 0.1s ease, opacity 0.2s ease',
                    opacity: verifyOtp.isPending ? 0.7 : 1,
                  }}
                >
                  <Lock size={16} />
                  {verifyOtp.isPending ? 'Verifying...' : 'Verify Code & Sign In'}
                </button>
              </>
            )}
          </form>

          {/* Footnote */}
          <div
            style={{
              marginTop: '28px',
              padding: '12px 14px',
              borderRadius: '10px',
              background: 'rgba(15, 23, 42, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.05)',
              color: '#94a3b8',
              fontSize: '12px',
              lineHeight: 1.5,
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
            }}
          >
            <ShieldCheck size={16} color="#818cf8" style={{ flexShrink: 0, marginTop: '2px' }} />
            <span>
              Codes expire in 10 minutes. Accounts lock temporarily after 3 consecutive failed attempts.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
