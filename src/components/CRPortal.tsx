import React, { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface StudentRosterItem {
  id: string;
  full_name: string;
  status: 'present' | 'absent' | 'od';
}

interface SubjectItem {
  code: string;
  name: string;
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
  const [slot, setSlot] = useState<string>('Slot 1 (09:00 - 10:00)');
  const [roster, setRoster] = useState<StudentRosterItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const fetchPortalData = async () => {
      setLoading(true);
      setMessage(null);

      try {
        // 1. Fetch subjects using select('*') so it adapts to whatever columns exist
        const { data: subjectData, error: subError } = await supabase
          .from('subjects')
          .select('*');

        if (subError) {
          console.warn('Could not load subjects from table, using defaults:', subError.message);
          const fallbackSubjects: SubjectItem[] = [
            { code: 'CS301', name: 'Data Structures & Algorithms' },
            { code: 'CS302', name: 'Object Oriented Programming' },
            { code: 'CS303', name: 'Digital Systems Design' },
            { code: 'CS304', name: 'Discrete Mathematics' },
          ];
          setSubjects(fallbackSubjects);
          setSelectedSubject(fallbackSubjects[0]);
        } else if (subjectData && subjectData.length > 0) {
          const parsedSubjects: SubjectItem[] = subjectData.map((row: any) => ({
            code: row.code || row.subject_code || row.id?.substring(0, 6)?.toUpperCase() || 'SUB',
            name: row.name || row.subject_name || row.title || 'Course Subject',
          }));
          setSubjects(parsedSubjects);
          setSelectedSubject(parsedSubjects[0]);
        } else {
          const fallbackSubjects: SubjectItem[] = [
            { code: 'CS302', name: 'Object Oriented Programming' },
            { code: 'CS303', name: 'Digital Systems Design' },
          ];
          setSubjects(fallbackSubjects);
          setSelectedSubject(fallbackSubjects[0]);
        }

        // 2. Fetch student roster from public.profiles
        const { data: studentsData, error: stuError } = await supabase
          .from('profiles')
          .select('id, full_name, department, semester')
          .order('full_name', { ascending: true });

        if (stuError) {
          throw stuError;
        }

        if (studentsData && studentsData.length > 0) {
          setRoster(
            studentsData.map((stu: any) => ({
              id: stu.id,
              full_name: stu.full_name || 'Enrolled Student',
              status: 'present',
            }))
          );
        } else {
          // If no profiles returned, at least include current user for logging test
          setRoster([
            {
              id: session.user.id,
              full_name: session.user.email?.split('@')[0] || 'Current Student',
              status: 'present',
            },
          ]);
        }
      } catch (err: any) {
        setMessage({ type: 'error', text: err.message || 'Failed to load roster data.' });
      } finally {
        setLoading(false);
      }
    };

    fetchPortalData();
  }, [session.user.id, session.user.email]);

  const toggleStatus = (studentId: string) => {
    setRoster((prev) =>
      prev.map((student) => {
        if (student.id !== studentId) return student;
        const nextStatus =
          student.status === 'present'
            ? 'absent'
            : student.status === 'absent'
            ? 'od'
            : 'present';
        return { ...student, status: nextStatus };
      })
    );
  };

  const setAllStatus = (newStatus: 'present' | 'absent') => {
    setRoster((prev) => prev.map((s) => ({ ...s, status: newStatus })));
  };

  const handleSaveAttendance = async () => {
    if (!selectedSubject) {
      setMessage({ type: 'error', text: 'Please select a subject.' });
      return;
    }

    if (roster.length === 0) {
      setMessage({ type: 'error', text: 'No students available in the roster to log.' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      // Step A: Insert master class session record
      const { data: sessionData, error: sessionError } = await supabase
        .from('class_sessions')
        .insert({
          cr_id: session.user.id,
          department: 'CSE',
          semester: 3,
          subject_code: selectedSubject.code,
          subject_name: selectedSubject.name,
          session_date: sessionDate,
          period_slot: slot,
        })
        .select('id')
        .single();

      if (sessionError) throw sessionError;

      const sessionId = sessionData.id;

      // Step B: Batch insert roster statuses into session_attendance
      const attendanceEntries = roster.map((student) => ({
        session_id: sessionId,
        student_id: student.id,
        status: student.status,
      }));

      const { error: batchError } = await supabase
        .from('session_attendance')
        .insert(attendanceEntries);

      if (batchError) throw batchError;

      setMessage({
        type: 'success',
        text: `Batch attendance successfully logged for ${selectedSubject.name} (${sessionDate})!`,
      });
    } catch (err: any) {
      setMessage({
        type: 'error',
        text: err.message || 'Failed to submit batch attendance.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const presentCount = roster.filter((s) => s.status === 'present').length;
  const absentCount = roster.filter((s) => s.status === 'absent').length;
  const odCount = roster.filter((s) => s.status === 'od').length;

  if (loading) {
    return (
      <div style={{ color: '#94a3b8', padding: '2rem 0', textAlign: 'center' }}>
        Loading CR Control Room & Roster...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Session Controls Card */}
      <div
        style={{
          background: 'var(--card-bg, #1e293b)',
          borderRadius: '12px',
          padding: '1.5rem',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
            marginBottom: '1.25rem',
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: '700' }}>
              CR Attendance Logging
            </h2>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
              Department: CSE • 3rd Semester
            </span>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              onClick={() => setAllStatus('present')}
              style={{
                background: 'rgba(34, 197, 94, 0.15)',
                border: '1px solid #22c55e',
                color: '#86efac',
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontWeight: '600',
              }}
            >
              All Present
            </button>
            <button
              type="button"
              onClick={() => setAllStatus('absent')}
              style={{
                background: 'rgba(239, 68, 68, 0.15)',
                border: '1px solid #ef4444',
                color: '#fca5a5',
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.78rem',
                fontWeight: '600',
              }}
            >
              Clear All
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
              Subject
            </label>
            <select
              value={selectedSubject?.code || ''}
              onChange={(e) => {
                const sub = subjects.find((s) => s.code === e.target.value);
                if (sub) setSelectedSubject(sub);
              }}
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                background: '#0f172a',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                fontSize: '0.85rem',
              }}
            >
              {subjects.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
              Session Date
            </label>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              style={{
                width: '100%',
                padding: '0.55rem 0.75rem',
                background: '#0f172a',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                fontSize: '0.85rem',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.35rem' }}>
              Time Slot
            </label>
            <select
              value={slot}
              onChange={(e) => setSlot(e.target.value)}
              style={{
                width: '100%',
                padding: '0.6rem 0.75rem',
                background: '#0f172a',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '6px',
                fontSize: '0.85rem',
              }}
            >
              <option value="Slot 1 (09:00 - 10:00)">Slot 1 (09:00 - 10:00)</option>
              <option value="Slot 2 (10:00 - 11:00)">Slot 2 (10:00 - 11:00)</option>
              <option value="Slot 3 (11:15 - 12:15)">Slot 3 (11:15 - 12:15)</option>
              <option value="Slot 4 (13:15 - 14:15)">Slot 4 (13:15 - 14:15)</option>
              <option value="Slot 5 (14:15 - 15:15)">Slot 5 (14:15 - 15:15)</option>
            </select>
          </div>
        </div>
      </div>

      {/* Roster Live Stat Counters */}
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ padding: '0.4rem 0.85rem', borderRadius: '20px', background: 'rgba(34, 197, 94, 0.15)', color: '#86efac', fontSize: '0.85rem', fontWeight: '600' }}>
          Present: {presentCount}
        </div>
        <div style={{ padding: '0.4rem 0.85rem', borderRadius: '20px', background: 'rgba(239, 68, 68, 0.15)', color: '#fca5a5', fontSize: '0.85rem', fontWeight: '600' }}>
          Absent: {absentCount}
        </div>
        <div style={{ padding: '0.4rem 0.85rem', borderRadius: '20px', background: 'rgba(234, 179, 8, 0.15)', color: '#fde047', fontSize: '0.85rem', fontWeight: '600' }}>
          On Duty: {odCount}
        </div>
      </div>

      {/* Feedback Alert */}
      {message && (
        <div
          style={{
            padding: '0.75rem 1rem',
            borderRadius: '8px',
            fontSize: '0.85rem',
            backgroundColor: message.type === 'success' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${message.type === 'success' ? '#22c55e' : '#ef4444'}`,
            color: message.type === 'success' ? '#86efac' : '#fca5a5',
          }}
        >
          {message.text}
        </div>
      )}

      {/* Roster Selection Grid */}
      <div
        style={{
          background: 'var(--card-bg, #1e293b)',
          borderRadius: '12px',
          padding: '1.25rem',
          border: '1px solid rgba(255, 255, 255, 0.1)',
        }}
      >
        <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginBottom: '1rem' }}>
          Tap any student card to toggle: <strong>Present</strong> → <strong>Absent</strong> → <strong>On Duty</strong>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.75rem' }}>
          {roster.map((student) => {
            const isPresent = student.status === 'present';
            const isAbsent = student.status === 'absent';

            return (
              <div
                key={student.id}
                onClick={() => toggleStatus(student.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  userSelect: 'none',
                  transition: 'all 0.15s ease',
                  backgroundColor: isPresent
                    ? 'rgba(34, 197, 94, 0.08)'
                    : isAbsent
                    ? 'rgba(239, 68, 68, 0.12)'
                    : 'rgba(234, 179, 8, 0.12)',
                  border: `1px solid ${
                    isPresent
                      ? 'rgba(34, 197, 94, 0.3)'
                      : isAbsent
                      ? 'rgba(239, 68, 68, 0.4)'
                      : 'rgba(234, 179, 8, 0.4)'
                  }`,
                }}
              >
                <span style={{ fontSize: '0.9rem', fontWeight: '500' }}>
                  {student.full_name}
                </span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: '700',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                    textTransform: 'uppercase',
                    color: isPresent ? '#4ade80' : isAbsent ? '#f87171' : '#facc15',
                    background: 'rgba(0, 0, 0, 0.25)',
                  }}
                >
                  {student.status}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={handleSaveAttendance}
            disabled={submitting}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#3b82f6',
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '0.95rem',
              fontWeight: '600',
              cursor: submitting ? 'not-allowed' : 'pointer',
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? 'Submitting Session...' : 'Submit Batch Attendance'}
          </button>
        </div>
      </div>
    </div>
  );
};