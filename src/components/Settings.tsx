import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  IconCheck,
} from './Icons';

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
      setError(err.message || 'Failed to load profile settings.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profile.target_threshold < 50 || profile.target_threshold > 100) {
      setError('Target percentage must be between 50% and 100%.');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

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

      if (semesterId && semesterEndDate) {
        const { error: semUpdateErr } = await supabase
          .from('semesters')
          .update({ end_date: semesterEndDate })
          .eq('id', semesterId);

        if (semUpdateErr) throw semUpdateErr;
      }

      setSuccess('Profile updated successfully.');
      onProfileUpdated();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading settings...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '800px', paddingBottom: '3rem' }}>
      
      <div className="card">
        <div style={{ marginBottom: '1.25rem', paddingBottom: '0.85rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 0.25rem 0' }}>
            Student Profile & Settings
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
            Manage your student credentials, branch, and examination attendance threshold.
          </p>
        </div>

        {error && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.84rem',
              fontWeight: 600,
              marginBottom: '1rem',
              backgroundColor: 'var(--status-danger-bg)',
              color: 'var(--status-danger)',
              border: '1px solid var(--status-danger-border)',
            }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.84rem',
              fontWeight: 600,
              marginBottom: '1rem',
              backgroundColor: 'var(--status-success-bg)',
              color: 'var(--status-success)',
              border: '1px solid var(--status-success-border)',
            }}
          >
            ✓ {success}
          </div>
        )}

        <form onSubmit={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Full Name
              </label>
              <input
                type="text"
                required
                value={profile.full_name}
                onChange={(e) => setProfile({ ...profile, full_name: e.target.value })}
                placeholder="e.g. Priyangshu Sarmah"
                className="input-field"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                College Roll / Registration No.
              </label>
              <input
                type="text"
                value={profile.roll_number}
                onChange={(e) => setProfile({ ...profile, roll_number: e.target.value })}
                placeholder="e.g. 24-CSE-01"
                className="input-field"
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Department
              </label>
              <input
                type="text"
                required
                value={profile.department}
                onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                placeholder="e.g. Computer Science & Engineering"
                className="input-field"
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Semester End Date
              </label>
              <input
                type="date"
                required
                value={semesterEndDate}
                onChange={(e) => setSemesterEndDate(e.target.value)}
                className="input-field"
              />
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'var(--bg-card-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-card)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-main)' }}>
                Target Attendance Percentage Cutoff
              </span>
              <strong style={{ fontSize: '1.15rem', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                {profile.target_threshold}%
              </strong>
            </div>

            <input
              type="range"
              min="50"
              max="95"
              step="1"
              value={profile.target_threshold}
              onChange={(e) => setProfile({ ...profile, target_threshold: Number(e.target.value) })}
              style={{ width: '100%', accentColor: 'var(--accent-primary)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', display: 'block', marginTop: '0.35rem' }}>
              Standard Dhemaji Engineering College exam eligibility mandate is 75%.
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary"
              style={{ padding: '0.65rem 1.4rem' }}
            >
              <IconCheck size={16} />
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
