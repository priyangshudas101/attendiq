import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

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
        throw new Error('Failed to initialize semester.');
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
    const confirmed = window.confirm(
      `Delete "${name}"?\nAll associated attendance records will be removed.`
    );
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
    return <div style={{ padding: '3rem 0', color: 'var(--text-muted)' }}>Loading course configuration...</div>;
  }

  return (
    <div style={{ maxWidth: '850px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <span className="eyebrow">
          {semester ? `SEMESTER ${semester.semester_number} (${semester.academic_year})` : 'SEMESTER'}
        </span>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0.2rem 0' }}>
          Course & Timetable Registry
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
          Manage your enrolled subjects and configure active timetable weekdays.
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

      {/* Add Course Form */}
      <form
        onSubmit={handleAddSubject}
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-md)',
          padding: '1.5rem',
          marginBottom: '2rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
              Subject Name
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Object Oriented Programming"
              value={subjectName}
              onChange={(e) => setSubjectName(e.target.value)}
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
              Subject Code
            </label>
            <input
              type="text"
              required
              placeholder="e.g. CS302"
              value={subjectCode}
              onChange={(e) => setSubjectCode(e.target.value)}
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
          <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.45rem' }}>
            Scheduled Weekdays (Click to toggle)
          </label>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {WEEKDAYS.map((d) => {
              const active = selectedDays.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => toggleDaySelection(d.value)}
                  style={{
                    padding: '0.4rem 0.85rem',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: active ? '1px solid var(--border-focus)' : '1px solid var(--border-subtle)',
                    backgroundColor: active ? 'var(--accent-primary)' : 'var(--bg-canvas)',
                    color: active ? '#ffffff' : 'var(--text-muted)',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <button
            type="submit"
            disabled={submitting}
            style={{
              padding: '0.65rem 1.5rem',
              backgroundColor: 'var(--accent-primary)',
              color: '#fff',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.88rem',
              fontWeight: 600,
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Registering...' : '+ Enroll Course'}
          </button>
        </div>
      </form>

      {/* Courses List */}
      <div>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '1rem' }}>
          Enrolled Courses ({subjects.length})
        </h3>

        {subjects.length === 0 ? (
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px dashed var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '2.5rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
            }}
          >
            No subjects registered yet. Enroll your first course above.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {subjects.map((sub) => (
              <div
                key={sub.id}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '1.15rem 1.4rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '1rem',
                  boxShadow: 'var(--shadow-sm)',
                }}
              >
                <div>
                  <strong style={{ display: 'block', fontSize: '1.05rem', color: 'var(--text-primary)' }}>
                    {sub.subject_name}
                  </strong>
                  <span style={{ fontSize: '0.8rem', color: '#818cf8', fontWeight: 600 }}>
                    {sub.subject_code}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                  {/* Inline Day Toggles for existing subjects */}
                  <div style={{ display: 'flex', gap: '0.3rem' }}>
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
                            padding: '0.25rem 0.55rem',
                            borderRadius: '4px',
                            fontSize: '0.72rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: active ? '1px solid var(--border-focus)' : '1px solid var(--border-subtle)',
                            backgroundColor: active ? 'var(--accent-primary)' : 'var(--bg-canvas)',
                            color: active ? '#ffffff' : 'var(--text-muted)',
                          }}
                          title={`Toggle ${d.label}`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleDeleteSubject(sub.id, sub.subject_name)}
                    style={{
                      background: 'var(--color-danger-bg)',
                      border: '1px solid var(--color-danger)',
                      color: '#f87171',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      padding: '0.35rem 0.75rem',
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};