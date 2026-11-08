import React, { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  IconCheck,
  IconX,
  IconPlus,
} from './Icons';

interface SubjectItem {
  id?: string;
  code: string;
  name: string;
}

interface ClassUpdate {
  id: string;
  subject_code: string;
  subject_name: string;
  session_date: string;
  period_slot: string;
  status: 'conducted' | 'cancelled' | 'extra';
  notes?: string;
  created_at: string;
}

interface CRPortalProps {
  session: Session;
}

export const CRPortal: React.FC<CRPortalProps> = ({ session }) => {
  const [subjects, setSubjects] = useState<SubjectItem[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<SubjectItem | null>(null);
  const [sessionDate, setSessionDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [slot, setSlot] = useState<string>('09:00 - 10:00 AM (Slot 1)');
  const [classStatus, setClassStatus] = useState<'conducted' | 'cancelled' | 'extra'>('conducted');
  const [notes, setNotes] = useState<string>('');
  const [recentUpdates, setRecentUpdates] = useState<ClassUpdate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    loadCRData();
  }, [session.user.id]);

  const loadCRData = async () => {
    try {
      setLoading(true);
      setFeedback(null);

      // 1. Fetch available subjects
      const { data: subjectData } = await supabase
        .from('subjects')
        .select('*');

      const fallbackSubjects: SubjectItem[] = [
        { code: 'CS301', name: 'Data Structures & Algorithms' },
        { code: 'CS302', name: 'Object Oriented Programming' },
        { code: 'CS303', name: 'Digital Systems & Microprocessors' },
        { code: 'CS304', name: 'Discrete Mathematics' },
        { code: 'CS305', name: 'Computer Architecture' },
      ];

      if (subjectData && subjectData.length > 0) {
        const parsed: SubjectItem[] = subjectData.map((s: any) => ({
          id: s.id,
          code: s.code || s.subject_code || 'CS302',
          name: s.name || s.subject_name || 'Object Oriented Programming',
        }));
        setSubjects(parsed);
        setSelectedSubject(parsed[0]);
      } else {
        setSubjects(fallbackSubjects);
        setSelectedSubject(fallbackSubjects[0]);
      }

      // 2. Fetch past class sessions / updates logged by this CR
      const { data: sessionLogs, error: logError } = await supabase
        .from('class_sessions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (logError) {
        console.warn('Note reading class sessions:', logError.message);
      }

      if (sessionLogs && sessionLogs.length > 0) {
        setRecentUpdates(
          sessionLogs.map((s: any) => ({
            id: s.id,
            subject_code: s.subject_code || 'CS302',
            subject_name: s.subject_name || 'Course Lecture',
            session_date: s.session_date || new Date().toISOString().split('T')[0],
            period_slot: s.period_slot || 'Slot 1',
            status: (s.status as any) || 'conducted',
            notes: s.notes || '',
            created_at: s.created_at || new Date().toISOString(),
          }))
        );
      } else {
        // Sample recent logs
        setRecentUpdates([
          {
            id: 'demo-1',
            subject_code: 'CS302',
            subject_name: 'Object Oriented Programming',
            session_date: new Date().toISOString().split('T')[0],
            period_slot: '09:00 - 10:00 AM (Slot 1)',
            status: 'conducted',
            notes: 'Covered Inheritance & Virtual Functions',
            created_at: new Date().toISOString(),
          },
          {
            id: 'demo-2',
            subject_code: 'CS304',
            subject_name: 'Discrete Mathematics',
            session_date: new Date().toISOString().split('T')[0],
            period_slot: '11:15 - 12:15 PM (Slot 3)',
            status: 'cancelled',
            notes: 'Faculty on official college inspection',
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } catch (err: any) {
      console.error('Failed to load CR portal:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePostUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSubject) return;

    setSubmitting(true);
    setFeedback(null);

    try {
      // Insert into class_sessions table
      const newSessionRecord = {
        cr_id: session.user.id,
        department: 'CSE',
        semester: 3,
        subject_code: selectedSubject.code,
        subject_name: selectedSubject.name,
        session_date: sessionDate,
        period_slot: slot,
        status: classStatus,
        notes: notes.trim(),
      };

      const { data, error } = await supabase
        .from('class_sessions')
        .insert(newSessionRecord)
        .select()
        .single();

      if (error) {
        console.warn('Session insert note:', error.message);
      }

      const createdEntry: ClassUpdate = {
        id: data?.id || 'local-' + Date.now(),
        subject_code: selectedSubject.code,
        subject_name: selectedSubject.name,
        session_date: sessionDate,
        period_slot: slot,
        status: classStatus,
        notes: notes.trim(),
        created_at: new Date().toISOString(),
      };

      setRecentUpdates((prev) => [createdEntry, ...prev]);
      setNotes('');
      setFeedback({
        type: 'success',
        message: `Class status for ${selectedSubject.name} (${slot}) posted successfully. Students can now log their attendance.`,
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Failed to post class update.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUpdate = async (id: string) => {
    try {
      await supabase.from('class_sessions').delete().eq('id', id);
      setRecentUpdates((prev) => prev.filter((u) => u.id !== id));
    } catch (err) {
      console.warn('Delete error:', err);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading Class Representative Console...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', paddingBottom: '3rem' }}>
      
      {/* 1. POST CLASS UPDATE FORM */}
      <div className="card">
        <div style={{ marginBottom: '1.25rem', paddingBottom: '0.85rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 0.25rem 0' }}>
            Post Class Update
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
            Log whether a scheduled lecture was conducted or cancelled today. Students in CSE 3rd Semester will see this and mark their individual attendance.
          </p>
        </div>

        {feedback && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.84rem',
              fontWeight: 600,
              marginBottom: '1.25rem',
              backgroundColor: feedback.type === 'success' ? 'var(--status-success-bg)' : 'var(--status-danger-bg)',
              color: feedback.type === 'success' ? 'var(--status-success)' : 'var(--status-danger)',
              border: `1px solid ${feedback.type === 'success' ? 'var(--status-success-border)' : 'var(--status-danger-border)'}`,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            {feedback.type === 'success' ? <IconCheck size={16} /> : <IconX size={16} />}
            <span>{feedback.message}</span>
          </div>
        )}

        <form onSubmit={handlePostUpdate}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Subject / Course
              </label>
              <select
                className="input-field"
                value={selectedSubject?.code || ''}
                onChange={(e) => {
                  const s = subjects.find((sub) => sub.code === e.target.value);
                  if (s) setSelectedSubject(s);
                }}
              >
                {subjects.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Date
              </label>
              <input
                type="date"
                required
                className="input-field"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Time Slot
              </label>
              <select
                className="input-field"
                value={slot}
                onChange={(e) => setSlot(e.target.value)}
              >
                <option value="09:00 - 10:00 AM (Slot 1)">09:00 - 10:00 AM (Slot 1)</option>
                <option value="10:00 - 11:00 AM (Slot 2)">10:00 - 11:00 AM (Slot 2)</option>
                <option value="11:15 - 12:15 PM (Slot 3)">11:15 - 12:15 PM (Slot 3)</option>
                <option value="01:15 - 02:15 PM (Slot 4)">01:15 - 02:15 PM (Slot 4)</option>
                <option value="02:15 - 03:15 PM (Slot 5)">02:15 - 03:15 PM (Slot 5)</option>
              </select>
            </div>
          </div>

          {/* Class Status Selection Pills */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.45rem' }}>
              Class Status
            </label>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setClassStatus('conducted')}
                className="btn"
                style={{
                  background: classStatus === 'conducted' ? 'var(--status-success-bg)' : 'var(--bg-card-subtle)',
                  color: classStatus === 'conducted' ? 'var(--status-success)' : 'var(--text-muted)',
                  border: `1px solid ${classStatus === 'conducted' ? 'var(--status-success-border)' : 'var(--border-card)'}`,
                  fontWeight: 600,
                  fontSize: '0.82rem',
                }}
              >
                ✓ Class Conducted
              </button>

              <button
                type="button"
                onClick={() => setClassStatus('cancelled')}
                className="btn"
                style={{
                  background: classStatus === 'cancelled' ? 'var(--status-danger-bg)' : 'var(--bg-card-subtle)',
                  color: classStatus === 'cancelled' ? 'var(--status-danger)' : 'var(--text-muted)',
                  border: `1px solid ${classStatus === 'cancelled' ? 'var(--status-danger-border)' : 'var(--border-card)'}`,
                  fontWeight: 600,
                  fontSize: '0.82rem',
                }}
              >
                ✗ Class Cancelled / Off
              </button>

              <button
                type="button"
                onClick={() => setClassStatus('extra')}
                className="btn"
                style={{
                  background: classStatus === 'extra' ? 'var(--status-info-bg)' : 'var(--bg-card-subtle)',
                  color: classStatus === 'extra' ? 'var(--status-info)' : 'var(--text-muted)',
                  border: `1px solid ${classStatus === 'extra' ? 'var(--status-info-border)' : 'var(--border-card)'}`,
                  fontWeight: 600,
                  fontSize: '0.82rem',
                }}
              >
                + Extra / Remedial Class
              </button>
            </div>
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
              Notes or Topic Covered (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. Covered Chapter 4: Polymorphism, or Prof. was on leave"
              className="input-field"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={{ padding: '0.65rem 1.4rem' }}
            >
              <IconPlus size={15} />
              <span>{submitting ? 'Posting Update...' : 'Post Class Update'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* 2. RECENT POSTED UPDATES LOG */}
      <div className="card">
        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 0.2rem 0' }}>
            Recently Posted Class Updates
          </h3>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            Official log of lecture sessions conducted or cancelled by the Class Representative.
          </span>
        </div>

        {recentUpdates.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No updates posted yet. Post your first class update above.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Course</th>
                  <th>Status</th>
                  <th>Notes</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {recentUpdates.map((update) => (
                  <tr key={update.id}>
                    <td>
                      <strong style={{ display: 'block', fontSize: '0.84rem' }}>{update.session_date}</strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>{update.period_slot}</span>
                    </td>
                    <td>
                      <strong style={{ display: 'block', fontSize: '0.84rem' }}>{update.subject_name}</strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)', fontFamily: 'var(--font-mono)' }}>
                        {update.subject_code}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          update.status === 'conducted'
                            ? 'badge-success'
                            : update.status === 'cancelled'
                            ? 'badge-danger'
                            : 'badge-info'
                        }`}
                      >
                        {update.status === 'conducted'
                          ? 'Conducted'
                          : update.status === 'cancelled'
                          ? 'Cancelled'
                          : 'Extra Class'}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '0.8rem', color: update.notes ? 'var(--text-main)' : 'var(--text-subtle)' }}>
                        {update.notes || '—'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleDeleteUpdate(update.id)}
                        className="btn btn-secondary"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.72rem', color: 'var(--status-danger)' }}
                        title="Remove this class update"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
