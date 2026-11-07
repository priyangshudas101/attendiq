import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface Subject {
  id: string;
  subject_name: string;
  subject_code: string;
  schedule_days: number[];
}

interface AttendanceRecord {
  id: string;
  subject_id: string;
  class_date: string;
  class_type: 'regular' | 'extra';
  status: 'present' | 'absent' | 'cancelled' | 'od';
  subjects?: {
    subject_name: string;
    subject_code: string;
  };
}

interface AttendanceProps {
  session: Session;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const Attendance: React.FC<AttendanceProps> = ({ session }) => {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [showAllSubjects, setShowAllSubjects] = useState<boolean>(false);
  const [batchStatus, setBatchStatus] = useState<
    Record<string, 'present' | 'absent' | 'cancelled' | 'od' | 'skip'>
  >({});
  const [classType, setClassType] = useState<'regular' | 'extra'>('regular');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Audit Ledger Filter State
  const [filterSubjectId, setFilterSubjectId] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [updatingRecordId, setUpdatingRecordId] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, [session.user.id]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data: subData, error: subError } = await supabase
        .from('subjects')
        .select('id, subject_name, subject_code, schedule_days')
        .eq('student_id', session.user.id)
        .order('subject_name', { ascending: true });

      if (subError) throw subError;
      const loadedSubjects: Subject[] = (subData || []).map((s) => ({
        ...s,
        schedule_days: s.schedule_days || [1, 2, 3, 4, 5],
      }));
      setSubjects(loadedSubjects);

      const initialBatch: Record<string, 'present' | 'absent' | 'cancelled' | 'od' | 'skip'> = {};
      loadedSubjects.forEach((s) => {
        initialBatch[s.id] = 'present';
      });
      setBatchStatus(initialBatch);

      const { data: recData, error: recError } = await supabase
        .from('attendance_records')
        .select(`
          id,
          subject_id,
          class_date,
          class_type,
          status,
          subjects (
            subject_name,
            subject_code
          )
        `)
        .eq('student_id', session.user.id)
        .order('class_date', { ascending: false });

      if (recError) throw recError;
      setRecords((recData as any) || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load telemetry roster.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = (
    subjectId: string,
    status: 'present' | 'absent' | 'cancelled' | 'od' | 'skip'
  ) => {
    setBatchStatus((prev) => ({ ...prev, [subjectId]: status }));
  };

  const selectedDateObj = new Date(selectedDate + 'T00:00:00');
  const dayIndex = selectedDateObj.getDay();
  const dayName = DAY_NAMES[dayIndex];

  const activeRoster = showAllSubjects
    ? subjects
    : subjects.filter((s) => s.schedule_days.includes(dayIndex));

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (activeRoster.length === 0 || !selectedDate) return;

    try {
      setSubmitting(true);
      setError(null);
      setSuccessMsg(null);

      const rowsToUpsert = activeRoster
        .filter((sub) => batchStatus[sub.id] && batchStatus[sub.id] !== 'skip')
        .map((sub) => ({
          student_id: session.user.id,
          subject_id: sub.id,
          class_date: selectedDate,
          class_type: classType,
          status: batchStatus[sub.id],
        }));

      if (rowsToUpsert.length === 0) {
        setError('No classes marked to log. Select an attendance state.');
        setSubmitting(false);
        return;
      }

      const { error: upsertError } = await supabase
        .from('attendance_records')
        .upsert(rowsToUpsert, {
          onConflict: 'student_id,subject_id,class_date',
        });

      if (upsertError) throw upsertError;

      await fetchData();
      setSuccessMsg(`Attendance committed for ${dayName}, ${selectedDate}.`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save daily sheet.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleInlineStatusUpdate = async (
    recordId: string,
    newStatus: 'present' | 'absent' | 'cancelled' | 'od'
  ) => {
    try {
      setUpdatingRecordId(recordId);
      const { error: updErr } = await supabase
        .from('attendance_records')
        .update({ status: newStatus })
        .eq('id', recordId);

      if (updErr) throw updErr;

      setRecords((prev) =>
        prev.map((r) => (r.id === recordId ? { ...r, status: newStatus } : r))
      );
    } catch (err: any) {
      setError(err.message || 'Failed to correct record status.');
    } finally {
      setUpdatingRecordId(null);
    }
  };

  const handleDeleteRecord = async (id: string) => {
    try {
      const { error: delError } = await supabase
        .from('attendance_records')
        .delete()
        .eq('id', id);

      if (delError) throw delError;
      setRecords((prev) => prev.filter((r) => r.id !== id));
    } catch (err: any) {
      setError(err.message || 'Failed to delete record.');
    }
  };

  const handleExportCSV = () => {
    if (filteredRecords.length === 0) return;

    const headers = ['Record ID', 'Date', 'Day', 'Subject Code', 'Subject Name', 'Type', 'Status'];
    const rows = filteredRecords.map((r) => {
      const d = new Date(r.class_date + 'T00:00:00');
      return [
        r.id,
        r.class_date,
        DAY_NAMES[d.getDay()],
        `"${r.subjects?.subject_code || ''}"`,
        `"${r.subjects?.subject_name || ''}"`,
        r.class_type,
        r.status === 'od' ? 'ON DUTY (OD)' : r.status.toUpperCase(),
      ];
    });

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `attendiq_audit_export_${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredRecords = records.filter((r) => {
    const matchesSubject = filterSubjectId === 'all' || r.subject_id === filterSubjectId;
    const matchesStatus = filterStatus === 'all' || r.status === filterStatus;
    return matchesSubject && matchesStatus;
  });

  if (loading) {
    return <div style={{ padding: '3rem 0', color: 'var(--text-muted)' }}>Loading timetable sheet...</div>;
  }

  return (
    <div style={{ maxWidth: '900px' }}>
      <div style={{ marginBottom: '2rem' }}>
        <span className="eyebrow">RAPID ROSTER</span>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: '0.2rem 0' }}>
          Daily Attendance Sheet
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
          Automatically filtered for <strong>{dayName}'s</strong> timetable. Log all periods in one commit.
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

      {successMsg && (
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
          {successMsg}
        </div>
      )}

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
          No registered courses. Head to <strong>Subjects</strong> to configure your timetable.
        </div>
      ) : (
        <form
          onSubmit={handleBatchSubmit}
          style={{
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '1.5rem',
            marginBottom: '2.5rem',
            boxShadow: 'var(--shadow-sm)',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: '1.25rem',
              alignItems: 'center',
              flexWrap: 'wrap',
              paddingBottom: '1.25rem',
              borderBottom: '1px solid var(--border-subtle)',
              marginBottom: '1.25rem',
            }}
          >
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Class Date ({dayName})
              </label>
              <input
                type="date"
                required
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                style={{
                  padding: '0.55rem 0.8rem',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.35rem' }}>
                Schedule Type
              </label>
              <select
                value={classType}
                onChange={(e) => setClassType(e.target.value as 'regular' | 'extra')}
                style={{
                  padding: '0.55rem 0.8rem',
                  backgroundColor: 'var(--bg-input)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: '0.85rem',
                }}
              >
                <option value="regular">Regular Timetable</option>
                <option value="extra">Extra / Remedial</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.25rem' }}>
              <button
                type="button"
                onClick={() => setShowAllSubjects(!showAllSubjects)}
                style={{
                  background: showAllSubjects ? 'var(--accent-primary)' : 'var(--bg-canvas)',
                  border: '1px solid var(--border-subtle)',
                  color: showAllSubjects ? '#fff' : 'var(--text-secondary)',
                  padding: '0.5rem 0.85rem',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {showAllSubjects ? '✓ Showing All Subjects' : '+ Show All Courses'}
              </button>
            </div>

            <div style={{ marginLeft: 'auto', alignSelf: 'flex-end' }}>
              <button
                type="submit"
                disabled={submitting || activeRoster.length === 0}
                style={{
                  padding: '0.65rem 1.5rem',
                  backgroundColor: 'var(--accent-primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  cursor: submitting || activeRoster.length === 0 ? 'not-allowed' : 'pointer',
                  opacity: submitting || activeRoster.length === 0 ? 0.6 : 1,
                  boxShadow: '0 4px 12px var(--accent-glow)',
                }}
              >
                {submitting ? 'Committing...' : 'Commit Daily Sheet'}
              </button>
            </div>
          </div>

          {activeRoster.length === 0 ? (
            <div
              style={{
                padding: '2rem',
                textAlign: 'center',
                color: 'var(--text-muted)',
                backgroundColor: 'var(--bg-canvas)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              No classes scheduled on <strong>{dayName}</strong>. 
              <br />
              <button
                type="button"
                onClick={() => setShowAllSubjects(true)}
                style={{
                  marginTop: '0.75rem',
                  background: 'none',
                  border: 'none',
                  color: '#818cf8',
                  cursor: 'pointer',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                }}
              >
                Click here to show all courses if you attended an extra session.
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {activeRoster.map((sub) => {
                const current = batchStatus[sub.id] || 'present';

                return (
                  <div
                    key={sub.id}
                    style={{
                      backgroundColor: 'var(--bg-canvas)',
                      border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '0.85rem 1.25rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '0.75rem',
                    }}
                  >
                    <div>
                      <strong style={{ color: 'var(--text-primary)', fontSize: '0.95rem', display: 'block' }}>
                        {sub.subject_name}
                      </strong>
                      <span style={{ fontSize: '0.75rem', color: '#818cf8', fontWeight: 600 }}>
                        {sub.subject_code}
                      </span>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        backgroundColor: 'var(--bg-surface)',
                        borderRadius: '6px',
                        padding: '3px',
                        gap: '4px',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleStatusChange(sub.id, 'present')}
                        style={{
                          padding: '0.4rem 0.85rem',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          backgroundColor: current === 'present' ? 'var(--color-success)' : 'transparent',
                          color: current === 'present' ? '#fff' : 'var(--text-secondary)',
                        }}
                      >
                        Present
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStatusChange(sub.id, 'od')}
                        style={{
                          padding: '0.4rem 0.85rem',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          backgroundColor: current === 'od' ? '#6366f1' : 'transparent',
                          color: current === 'od' ? '#fff' : '#a5b4fc',
                        }}
                        title="On Duty (Hackathon, Sports, Official Representation)"
                      >
                        OD
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStatusChange(sub.id, 'absent')}
                        style={{
                          padding: '0.4rem 0.85rem',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          backgroundColor: current === 'absent' ? 'var(--color-danger)' : 'transparent',
                          color: current === 'absent' ? '#fff' : 'var(--text-secondary)',
                        }}
                      >
                        Absent
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStatusChange(sub.id, 'cancelled')}
                        style={{
                          padding: '0.4rem 0.85rem',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          backgroundColor: current === 'cancelled' ? 'var(--color-warning)' : 'transparent',
                          color: current === 'cancelled' ? '#fff' : 'var(--text-secondary)',
                        }}
                      >
                        Off
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStatusChange(sub.id, 'skip')}
                        style={{
                          padding: '0.4rem 0.85rem',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          backgroundColor: current === 'skip' ? '#475569' : 'transparent',
                          color: current === 'skip' ? '#fff' : 'var(--text-muted)',
                        }}
                      >
                        No Class
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </form>
      )}

      {/* Historical Audit Ledger */}
      <section style={{ marginTop: '3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <span className="eyebrow">DATA INTEGRITY & AUDIT</span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.2rem 0' }}>
              Attendance Audit Ledger ({filteredRecords.length})
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
              Correct individual entries in-place or export the official CSV statement.
            </p>
          </div>

          <button
            type="button"
            onClick={handleExportCSV}
            disabled={filteredRecords.length === 0}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              color: filteredRecords.length === 0 ? 'var(--text-muted)' : 'var(--text-primary)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: filteredRecords.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            ↓ Export Audit Statement (CSV)
          </button>
        </div>

        {/* Filter Toolbar */}
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            alignItems: 'center',
            flexWrap: 'wrap',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '0.85rem 1.25rem',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Course Filter:
            </span>
            <select
              value={filterSubjectId}
              onChange={(e) => setFilterSubjectId(e.target.value)}
              style={{
                padding: '0.4rem 0.65rem',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
              }}
            >
              <option value="all">All Registered Courses</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.subject_name} ({s.subject_code})
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
              Status Filter:
            </span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{
                padding: '0.4rem 0.65rem',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.8rem',
              }}
            >
              <option value="all">All Statuses</option>
              <option value="present">Present Only</option>
              <option value="od">On Duty (OD) Only</option>
              <option value="absent">Absent Only</option>
              <option value="cancelled">Class Off Only</option>
            </select>
          </div>

          {(filterSubjectId !== 'all' || filterStatus !== 'all') && (
            <button
              type="button"
              onClick={() => { setFilterSubjectId('all'); setFilterStatus('all'); }}
              style={{
                background: 'none',
                border: 'none',
                color: '#818cf8',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                marginLeft: 'auto',
              }}
            >
              Reset Filters
            </button>
          )}
        </div>

        {/* Audit Record Items */}
        {filteredRecords.length === 0 ? (
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px dashed var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '2.5rem',
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.88rem',
            }}
          >
            No historical records matching current filter criteria.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {filteredRecords.map((r) => (
              <div
                key={r.id}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '0.85rem 1.25rem',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.75rem',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                    <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                      {r.subjects?.subject_name || 'Subject'}
                    </strong>
                    {r.status === 'od' && (
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(99, 102, 241, 0.2)',
                          color: '#818cf8',
                          border: '1px solid rgba(99, 102, 241, 0.4)',
                        }}
                      >
                        ON DUTY
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontSize: '0.78rem',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      gap: '0.75rem',
                      marginTop: '0.2rem',
                    }}
                  >
                    <span>{r.class_date}</span>
                    <span>•</span>
                    <span style={{ textTransform: 'capitalize' }}>{r.class_type}</span>
                    <span>•</span>
                    <span>{r.subjects?.subject_code}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      backgroundColor: 'var(--bg-canvas)',
                      borderRadius: '6px',
                      padding: '2px',
                      gap: '3px',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <button
                      type="button"
                      disabled={updatingRecordId === r.id}
                      onClick={() => handleInlineStatusUpdate(r.id, 'present')}
                      style={{
                        padding: '0.25rem 0.55rem',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        backgroundColor: r.status === 'present' ? 'var(--color-success)' : 'transparent',
                        color: r.status === 'present' ? '#fff' : 'var(--text-muted)',
                      }}
                      title="Mark Present"
                    >
                      P
                    </button>
                    <button
                      type="button"
                      disabled={updatingRecordId === r.id}
                      onClick={() => handleInlineStatusUpdate(r.id, 'od')}
                      style={{
                        padding: '0.25rem 0.55rem',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        backgroundColor: r.status === 'od' ? '#6366f1' : 'transparent',
                        color: r.status === 'od' ? '#fff' : '#a5b4fc',
                      }}
                      title="Mark On Duty"
                    >
                      OD
                    </button>
                    <button
                      type="button"
                      disabled={updatingRecordId === r.id}
                      onClick={() => handleInlineStatusUpdate(r.id, 'absent')}
                      style={{
                        padding: '0.25rem 0.55rem',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        backgroundColor: r.status === 'absent' ? 'var(--color-danger)' : 'transparent',
                        color: r.status === 'absent' ? '#fff' : 'var(--text-muted)',
                      }}
                      title="Mark Absent"
                    >
                      A
                    </button>
                    <button
                      type="button"
                      disabled={updatingRecordId === r.id}
                      onClick={() => handleInlineStatusUpdate(r.id, 'cancelled')}
                      style={{
                        padding: '0.25rem 0.55rem',
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        backgroundColor: r.status === 'cancelled' ? 'var(--color-warning)' : 'transparent',
                        color: r.status === 'cancelled' ? '#fff' : 'var(--text-muted)',
                      }}
                      title="Mark Class Cancelled"
                    >
                      Off
                    </button>
                  </div>

                  <button
                    onClick={() => handleDeleteRecord(r.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      padding: '0.2rem 0.4rem',
                      marginLeft: '0.25rem',
                    }}
                    title="Purge record"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};