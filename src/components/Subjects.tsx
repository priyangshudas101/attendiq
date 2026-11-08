import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  IconPlus,
} from './Icons';

interface Subject {
  id: string;
  subject_name: string;
  subject_code: string;
  semester_id: string;
  schedule_days: number[];
}

interface Semester {
  id: string;
  semester_number: number;
  academic_year: string;
  status: string;
}

interface SubjectsProps {
  session: Session;
}

const WEEKDAYS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

export const Subjects: React.FC<SubjectsProps> = ({ session }) => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [semester, setSemester] = useState<Semester | null>(null);
  const [subjectName, setSubjectName] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    initSemesterAndSubjects();
  }, [session.user.id]);

  const initSemesterAndSubjects = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: activeSemesters, error: semError } = await supabase
        .from('semesters')
        .select('id, semester_number, academic_year, status')
        .eq('student_id', session.user.id)
        .eq('status', 'active')
        .limit(1);

      if (semError) throw semError;

      let currentSem = activeSemesters && activeSemesters.length > 0 ? activeSemesters[0] : null;

      if (!currentSem) {
        const { data: newSem, error: createSemError } = await supabase
          .from('semesters')
          .insert({
            student_id: session.user.id,
            semester_number: 3,
            academic_year: '2026-2027',
            status: 'active',
          })
          .select()
          .single();

        if (createSemError) throw createSemError;
        currentSem = newSem;
      }

      setSemester(currentSem);

      if (!currentSem) {
        throw new Error('Failed to load active semester.');
      }

      const { data: subjectData, error: subError } = await supabase
        .from('subjects')
        .select('id, subject_name, subject_code, semester_id, schedule_days')
        .eq('semester_id', currentSem.id)
        .order('subject_name', { ascending: true });

      if (subError) throw subError;

      setSubjects(
        (subjectData || []).map((s) => ({
          ...s,
          schedule_days: s.schedule_days || [1, 2, 3, 4, 5],
        }))
      );
    } catch (err: any) {
      setError(err.message || 'Failed to load courses.');
    } finally {
      setLoading(false);
    }
  };

  const toggleDaySelection = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const handleAddSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subjectName.trim() || !subjectCode.trim() || !semester) return;
    if (selectedDays.length === 0) {
      setError('Please select at least one weekday for this course.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);

      const newSubject = {
        student_id: session.user.id,
        semester_id: semester.id,
        subject_name: subjectName.trim(),
        subject_code: subjectCode.trim().toUpperCase(),
        schedule_days: selectedDays,
      };

      const { data, error: insertError } = await supabase
        .from('subjects')
        .insert(newSubject)
        .select()
        .single();

      if (insertError) throw insertError;

      setSubjects((prev) => [...prev, data]);
      setSubjectName('');
      setSubjectCode('');
      setSelectedDays([1, 2, 3, 4, 5]);
      setSuccess(`Subject "${newSubject.subject_name}" added successfully.`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to add course.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateScheduleDays = async (subjectId: string, days: number[]) => {
    try {
      const { error: updError } = await supabase
        .from('subjects')
        .update({ schedule_days: days })
        .eq('id', subjectId);

      if (updError) throw updError;

      setSubjects((prev) =>
        prev.map((s) => (s.id === subjectId ? { ...s, schedule_days: days } : s))
      );
    } catch (err: any) {
      setError(err.message || 'Failed to update course schedule.');
    }
  };

  const handleDeleteSubject = async (id: string, name: string) => {
    const confirmed = window.confirm(`Are you sure you want to delete "${name}"?`);
    if (!confirmed) return;

    try {
      setError(null);
      const { error: delError } = await supabase.from('subjects').delete().eq('id', id);
      if (delError) throw delError;

      setSubjects((prev) => prev.filter((s) => s.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete course.');
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading registered courses...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', paddingBottom: '3rem' }}>
      
      {/* 1. ADD NEW SUBJECT */}
      <div className="card">
        <div style={{ marginBottom: '1.25rem', paddingBottom: '0.85rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 0.25rem 0' }}>
            Add Semester Subject
          </h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
            Register your courses for Semester {semester?.semester_number || 3} ({semester?.academic_year || '2026–2027'}).
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

        <form onSubmit={handleAddSubject}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Subject Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Object Oriented Programming"
                className="input-field"
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                Subject Code
              </label>
              <input
                type="text"
                required
                placeholder="e.g. CS302"
                className="input-field"
                value={subjectCode}
                onChange={(e) => setSubjectCode(e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.45rem' }}>
              Scheduled Lecture Days
            </label>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              {WEEKDAYS.map((d) => {
                const active = selectedDays.includes(d.value);
                return (
                  <button
                    key={d.value}
                    type="button"
                    onClick={() => toggleDaySelection(d.value)}
                    className="btn"
                    style={{
                      padding: '0.35rem 0.8rem',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      background: active ? 'var(--accent-primary)' : 'var(--bg-card-subtle)',
                      color: active ? '#ffffff' : 'var(--text-muted)',
                      border: `1px solid ${active ? 'var(--accent-primary)' : 'var(--border-card)'}`,
                    }}
                  >
                    {active ? `✓ ${d.label}` : d.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary"
              style={{ padding: '0.65rem 1.4rem' }}
            >
              <IconPlus size={15} />
              <span>{submitting ? 'Saving...' : 'Add Subject'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* 2. REGISTERED SUBJECTS TABLE */}
      <div className="card">
        <div style={{ marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 0.2rem 0' }}>
            Registered Subjects ({subjects.length})
          </h3>
          <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            Configured timetable weekdays per course.
          </span>
        </div>

        {subjects.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No subjects registered yet. Add your first subject above.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Subject Code</th>
                  <th>Subject Name</th>
                  <th>Timetable Days</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((sub) => (
                  <tr key={sub.id}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--accent-primary)', fontSize: '0.84rem' }}>
                        {sub.subject_code}
                      </span>
                    </td>
                    <td>
                      <strong style={{ fontSize: '0.88rem', color: 'var(--text-main)' }}>
                        {sub.subject_name}
                      </strong>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.25rem' }}>
                        {WEEKDAYS.map((d) => {
                          const active = sub.schedule_days.includes(d.value);
                          return (
                            <button
                              key={d.value}
                              type="button"
                              onClick={() => {
                                const newDays = active
                                  ? sub.schedule_days.filter((x) => x !== d.value)
                                  : [...sub.schedule_days, d.value].sort();
                                handleUpdateScheduleDays(sub.id, newDays);
                              }}
                              style={{
                                padding: '0.15rem 0.45rem',
                                borderRadius: '3px',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                                background: active ? 'var(--accent-primary-soft)' : 'transparent',
                                color: active ? 'var(--accent-primary)' : 'var(--text-subtle)',
                                border: `1px solid ${active ? 'var(--accent-primary-border)' : 'var(--border-subtle)'}`,
                              }}
                              title={`Toggle ${d.label}`}
                            >
                              {d.label}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        onClick={() => handleDeleteSubject(sub.id, sub.subject_name)}
                        className="btn btn-secondary"
                        style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem', color: 'var(--status-danger)' }}
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
