import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface Profile {
  full_name: string;
  roll_number: string;
  department: string;
  target_threshold: number;
}

interface SettingsProps {
  session: Session;
  onProfileUpdated: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ session, onProfileUpdated }) => {
  const [profile, setProfile] = useState<Profile>({
    full_name: '',
    roll_number: '',
    department: 'Computer Science & Engineering',
    target_threshold: 75,
  });
  const [semesterEndDate, setSemesterEndDate] = useState<string>('');
  const [semesterId, setSemesterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetchSettingsData();
  }, [session.user.id]);

  const fetchSettingsData = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch Profile
      const { data: profileData, error: fetchErr } = await supabase
        .from('profiles')
        .select('full_name, roll_number, department, target_threshold')
        .eq('id', session.user.id)
        .single();

      if (fetchErr && fetchErr.code !== 'PGRST116') throw fetchErr;

      if (profileData) {
        setProfile({
          full_name: profileData.full_name || '',
          roll_number: profileData.roll_number || '',
          department: profileData.department || 'Computer Science & Engineering',
          target_threshold: profileData.target_threshold ? Number(profileData.target_threshold) : 75,
        });
      }

      // 2. Fetch Active Semester End Date
      const { data: semData, error: semErr } = await supabase
        .from('semesters')
        .select('id, end_date')
        .eq('student_id', session.user.id)
        .eq('status', 'active')
        .limit(1);

      if (semErr) throw semErr;

      if (semData && semData.length > 0) {
        setSemesterId(semData[0].id);
        if (semData[0].end_date) {
          setSemesterEndDate(semData[0].end_date);
        } else {
          const defaultDate = new Date();
          defaultDate.setDate(defaultDate.getDate() + 60);
          setSemesterEndDate(defaultDate.toISOString().split('T')[0]);
        }
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load configuration parameters.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profile.target_threshold < 50 || profile.target_threshold > 100) {
      setError('Target threshold must be between 50% and 100%.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      // 1. Update Profile
      const { error: upsertErr } = await supabase
        .from('profiles')
        .upsert({
          id: session.user.id,
          full_name: profile.full_name.trim(),
          roll_number: profile.roll_number.trim(),
          department: profile.department.trim(),
          target_threshold: Number(profile.target_threshold),
          updated_at: new Date().toISOString(),
        });

      if (upsertErr) throw upsertErr;

      // 2. Update Semester End Date
      if (semesterId && semesterEndDate) {
        const { error: semUpdateErr } = await supabase
          .from('semesters')
          .update({ end_date: semesterEndDate })
          .eq('id', semesterId);

        if (semUpdateErr) throw semUpdateErr;
      }

      setSuccess('Parameters committed successfully.');
      onProfileUpdated();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to persist settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '3rem 0', color: 'var(--text-muted)' }}>Loading telemetry parameters...</div>;
  }

  return (
    <div style={{ maxWidth: '800px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <span className="eyebrow">SYSTEM PARAMETERS</span>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0.2rem 0' }}>
          Profile & Academic Horizon
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
          Manage your student credentials, cutoff rules, and exam eligibility calendar.
        </p>
      </div>

      {error && (
        <div
          style={{
            backgroundColor: 'var(--color-danger-bg)',
            border: '1px solid var(--color-danger)',
            color: '#fca5a5',
            padding: '0.85rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            backgroundColor: 'var(--color-success-bg)',
            border: '1px solid var(--color-success)',
            color: '#6ee7b7',
            padding: '0.85rem 1.25rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            fontSize: '0.875rem',
          }}
        >
          {success}
        </div>
      )}

      <form
        onSubmit={handleSave}
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '1.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              Full Name
            </label>
            <input
              type="text"
              required
              value={profile.full_name}
              onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
              placeholder="e.g. Priyangshu Das"
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.88rem',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              University Roll / Registration No.
            </label>
            <input
              type="text"
              value={profile.roll_number}
              onChange={(e) => setProfile({ ...profile, roll_number: e.target.value })}
              placeholder="e.g. 240101001"
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.88rem',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '1.25rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              Department / Specialization
            </label>
            <input
              type="text"
              required
              value={profile.department}
              onChange={(e) => setProfile({ ...profile, department: e.target.value })}
              placeholder="e.g. Computer Science & Engineering"
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.88rem',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              Last Class Date (Pre-Exam Horizon)
            </label>
            <input
              type="date"
              required
              value={semesterEndDate}
              onChange={(e) => setSemesterEndDate(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.88rem',
              }}
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
            Institutional Target Threshold ({profile.target_threshold}%)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            <input
              type="range"
              min="50"
              max="95"
              step="1"
              value={profile.target_threshold}
              onChange={(e) => setProfile({ ...profile, target_threshold: Number(e.target.value) })}
              style={{ flex: 1, accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
            />
            <span
              style={{
                backgroundColor: 'var(--bg-input)',
                padding: '0.4rem 0.85rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-subtle)',
                fontWeight: 700,
                color: '#818cf8',
                minWidth: '55px',
                textAlign: 'center',
              }}
            >
              {profile.target_threshold}%
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem', display: 'block' }}>
            All exam eligibility equations and ceiling calculations execute against this mandate.
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button
            type="submit"
            disabled={saving}
            style={{
              padding: '0.65rem 1.75rem',
              backgroundColor: 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.88rem',
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
              opacity: saving ? 0.7 : 1,
              boxShadow: '0 4px 12px var(--accent-glow)',
            }}
          >
            {saving ? 'Persisting...' : 'Save Configuration'}
          </button>
        </div>
      </form>
    </div>
  );
};