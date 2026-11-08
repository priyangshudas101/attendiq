import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  IconCheck,
  IconX,
} from './Icons';

interface AuthProps {
  onAuthSuccess: () => void;
  initialMode?: 'signin' | 'signup' | 'forgot' | 'reset';
}

export const Auth: React.FC<AuthProps> = ({ onAuthSuccess, initialMode = 'signin' }) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot' | 'reset'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      if (mode === 'signup') {
        if (!fullName.trim()) {
          throw new Error('Please enter your full name.');
        }

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
        });

        if (authError) throw authError;

        if (authData.user) {
          const { error: profileError } = await supabase.from('profiles').upsert({
            id: authData.user.id,
            full_name: fullName.trim(),
            college: 'Dhemaji Engineering College',
            department: 'Computer Science & Engineering',
          });

          if (profileError) throw profileError;
        }

        onAuthSuccess();
      } else if (mode === 'signin') {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) throw signInError;
        onAuthSuccess();
      } else if (mode === 'forgot') {
        const redirectUrl = `${window.location.origin}/`;
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: redirectUrl,
        });

        if (resetError) throw resetError;
        setSuccessMessage('Password reset link sent! Check your inbox.');
      } else if (mode === 'reset') {
        if (password.length < 6) {
          throw new Error('Password must be at least 6 characters long.');
        }
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match.');
        }

        const { error: updateError } = await supabase.auth.updateUser({
          password,
        });

        if (updateError) throw updateError;
        setSuccessMessage('Password updated successfully! Redirecting...');
        setTimeout(() => {
          onAuthSuccess();
        }, 1500);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An error occurred during authentication.');
    } finally {
      setLoading(false);
    }
  };

  const getHeading = () => {
    switch (mode) {
      case 'signup':
        return 'Create Student Account';
      case 'forgot':
        return 'Reset Password';
      case 'reset':
        return 'Set New Password';
      default:
        return 'Student Portal Sign In';
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-app)',
        padding: '2rem 1.5rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-card)',
          boxShadow: 'var(--shadow-card)',
          padding: '2.25rem',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--accent-primary)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '1.25rem',
              margin: '0 auto 0.75rem auto',
            }}
          >
            A
          </div>
          <h1 style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 0.25rem 0' }}>
            AttendIQ
          </h1>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: 500, display: 'block' }}>
            Dhemaji Engineering College
          </span>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-subtle)', display: 'block', marginTop: '0.2rem' }}>
            Student Attendance Management Portal
          </span>
        </div>

        <div style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 0.2rem 0', color: 'var(--text-main)' }}>
            {getHeading()}
          </h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {mode === 'signup'
              ? 'Register with your college email to access your attendance records.'
              : mode === 'forgot'
              ? 'Enter your registered email to receive a password recovery link.'
              : 'Enter your student credentials to continue.'}
          </span>
        </div>

        {errorMessage && (
          <div
            style={{
              backgroundColor: 'var(--status-danger-bg)',
              border: '1px solid var(--status-danger-border)',
              color: 'var(--status-danger)',
              padding: '0.75rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.82rem',
              fontWeight: 600,
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <IconX size={15} />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div
            style={{
              backgroundColor: 'var(--status-success-bg)',
              border: '1px solid var(--status-success-border)',
              color: 'var(--status-success)',
              padding: '0.75rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.82rem',
              fontWeight: 600,
              marginBottom: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <IconCheck size={15} />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
          {mode === 'signup' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Full Name
              </label>
              <input
                type="text"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Priyangshu Sarmah"
                className="input-field"
              />
            </div>
          )}

          {mode !== 'reset' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                College Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@dec.ac.in"
                className="input-field"
              />
            </div>
          )}

          {mode !== 'forgot' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Password
                </label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setErrorMessage(null);
                      setSuccessMessage(null);
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--accent-primary)',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="input-field"
              />
            </div>
          )}

          {mode === 'reset' && (
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••••••"
                className="input-field"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{
              marginTop: '0.5rem',
              padding: '0.7rem',
              fontSize: '0.9rem',
            }}
          >
            {loading
              ? 'Please wait...'
              : mode === 'signup'
              ? 'Create Account'
              : mode === 'forgot'
              ? 'Send Reset Link'
              : mode === 'reset'
              ? 'Update Password'
              : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
          {mode === 'forgot' ? (
            <button
              type="button"
              onClick={() => {
                setMode('signin');
                setErrorMessage(null);
                setSuccessMessage(null);
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--accent-primary)',
                fontWeight: 600,
                cursor: 'pointer',
                padding: 0,
              }}
            >
              ← Back to Sign In
            </button>
          ) : mode !== 'reset' ? (
            <>
              {mode === 'signup' ? 'Already registered?' : "Need an account?"}{' '}
              <button
                type="button"
                onClick={() => {
                  setMode(mode === 'signup' ? 'signin' : 'signup');
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-primary)',
                  fontWeight: 700,
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                {mode === 'signup' ? 'Sign In' : 'Register here'}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
