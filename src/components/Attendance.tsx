import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  IconDownload,
  IconCheck,
  IconX,
} from './Icons';
import { ensureStudentSubjects } from '../lib/subjectsService';

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

  // Filter State
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

      let loadedSubjects: Subject[] = [];
      const { data: subData, error: subError } = await supabase
        .from('subjects')
        .select('id, subject_name, subject_code, schedule_days')
        .eq('student_id', session.user.id)
        .order('subject_name', { ascending: true });

      if (subError) throw subError;

      if (subData && subData.length > 0) {
        loadedSubjects = subData.map((s) => ({
          ...s,
          schedule_days: s.schedule_days || [1, 2, 3, 4, 5],
        }));
      } else {
        const seeded = await ensureStudentSubjects(session.user.id);
        loadedSubjects = seeded.map((s) => ({
          id: s.id,
          subject_name: s.subject_name,
          subject_code: s.subject_code,
          schedule_days: s.schedule_days || [1, 2, 3, 4, 5],
        }));
      }

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
      setError(err.message || 'Failed to load attendance records.');
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

  const setAllBatchStatus = (status: 'present' | 'absent') => {
    const updated: Record<string, 'present' | 'absent' | 'cancelled' | 'od' | 'skip'> = {};
    activeRoster.forEach((sub) => {
      updated[sub.id] = status;
    });
    setBatchStatus((prev) => ({ ...prev, ...updated }));
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
        setError('No classes marked to record. Please select an attendance status.');
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
      setSuccessMsg(`Attendance for ${dayName}, ${selectedDate} saved successfully.`);
      setTimeout(() => setSuccessMsg(null), 3500);
    } catch (err: any) {
      setError(err.message || 'Failed to save attendance.');
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
      setError(err.message || 'Failed to update record.');
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

    const headers = ['Record ID', 'Date', 'Day', 'Subject Code', 'Subject Name', 'Class Type', 'Status'];
    const rows = filteredRecords.map((r) => {
      const d = new Date(r.class_date + 'T00:00:00');
      return [
        r.id,
        r.class_date,
        DAY_NAMES[d.getDay()],
        `"${r.subjects?.subject_code || ''}"`,
        `"${r.subjects?.subject_name || ''}"`,
        r.class_type,
        r.status.toUpperCase(),
      ];
    });

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `attendance_report_${selectedDate}.csv`);
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
    return (
      <div style={{ padding: '3rem 0', textAlign: 'center', color: 'var(--text-muted)' }}>
        Loading attendance records...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', paddingBottom: '3rem' }}>
      
      {/* 1. TODAY'S ATTENDANCE FORM */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem', paddingBottom: '0.85rem', borderBottom: '1px solid var(--border-subtle)' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 0.25rem 0' }}>
              Mark Daily Attendance
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
              Classes scheduled for <strong>{dayName}</strong>. Select your status for each period and commit.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setAllBatchStatus('present')}
              style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
            >
              ✓ Mark All Present
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowAllSubjects(!showAllSubjects)}
              style={{ fontSize: '0.78rem', padding: '0.35rem 0.75rem' }}
            >
              {showAllSubjects ? 'Showing All Courses' : '+ Show All Courses'}
            </button>
          </div>
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

        {successMsg && (
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
            ✓ {successMsg}
          </div>
        )}

        {subjects.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No registered subjects found. Go to <strong>Subjects</strong> to add your courses first.
          </div>
        ) : (
          <form onSubmit={handleBatchSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  Date
                </label>
                <input
                  type="date"
                  required
                  className="input-field"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                  Schedule Type
                </label>
                <select
                  className="input-field"
                  value={classType}
                  onChange={(e) => setClassType(e.target.value as 'regular' | 'extra')}
                >
                  <option value="regular">Regular Timetable</option>
                  <option value="extra">Extra / Remedial Lecture</option>
                </select>
              </div>
            </div>

            {activeRoster.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', background: 'var(--bg-card-subtle)', borderRadius: 'var(--radius-md)' }}>
                No lectures scheduled on <strong>{dayName}</strong>.
                <div style={{ marginTop: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setShowAllSubjects(true)}
                    className="btn btn-secondary"
                    style={{ fontSize: '0.78rem' }}
                  >
                    View All Courses to Log Extra Class
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {activeRoster.map((sub) => {
                  const current = batchStatus[sub.id] || 'present';

                  return (
                    <div
                      key={sub.id}
                      style={{
                        padding: '0.75rem 1rem',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-card-subtle)',
                        border: '1px solid var(--border-card)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.75rem',
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: '0.88rem', color: 'var(--text-main)', display: 'block' }}>
                          {sub.subject_name}
                        </strong>
                        <span style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                          {sub.subject_code}
                        </span>
                      </div>

                      <div style={{ display: 'flex', gap: '0.35rem' }}>
                        <button
                          type="button"
                          onClick={() => handleStatusChange(sub.id, 'present')}
                          className="btn"
                          style={{
                            padding: '0.35rem 0.75rem',
                            fontSize: '0.78rem',
                            background: current === 'present' ? 'var(--status-success)' : 'var(--bg-card)',
                            color: current === 'present' ? '#ffffff' : 'var(--text-muted)',
                            border: `1px solid ${current === 'present' ? 'var(--status-success)' : 'var(--border-card)'}`,
                          }}
                        >
                          Present
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStatusChange(sub.id, 'od')}
                          className="btn"
                          style={{
                            padding: '0.35rem 0.75rem',
                            fontSize: '0.78rem',
                            background: current === 'od' ? 'var(--status-info)' : 'var(--bg-card)',
                            color: current === 'od' ? '#ffffff' : 'var(--text-muted)',
                            border: `1px solid ${current === 'od' ? 'var(--status-info)' : 'var(--border-card)'}`,
                          }}
                          title="On Duty (Hackathons, Sports, Official Leave)"
                        >
                          OD
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStatusChange(sub.id, 'absent')}
                          className="btn"
                          style={{
                            padding: '0.35rem 0.75rem',
                            fontSize: '0.78rem',
                            background: current === 'absent' ? 'var(--status-danger)' : 'var(--bg-card)',
                            color: current === 'absent' ? '#ffffff' : 'var(--text-muted)',
                            border: `1px solid ${current === 'absent' ? 'var(--status-danger)' : 'var(--border-card)'}`,
                          }}
                        >
                          Absent
                        </button>

                        <button
                          type="button"
                          onClick={() => handleStatusChange(sub.id, 'cancelled')}
                          className="btn"
                          style={{
                            padding: '0.35rem 0.75rem',
                            fontSize: '0.78rem',
                            background: current === 'cancelled' ? 'var(--status-warning)' : 'var(--bg-card)',
                            color: current === 'cancelled' ? '#ffffff' : 'var(--text-muted)',
                            border: `1px solid ${current === 'cancelled' ? 'var(--status-warning)' : 'var(--border-card)'}`,
                          }}
                        >
                          Class Off
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <button
                type="submit"
                disabled={submitting || activeRoster.length === 0}
                className="btn btn-primary"
                style={{ padding: '0.65rem 1.4rem' }}
              >
                <IconCheck size={16} />
                <span>{submitting ? 'Saving...' : 'Save Attendance'}</span>
              </button>
            </div>
          </form>
        )}
      </div>

      {/* 2. ATTENDANCE HISTORY AUDIT */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', margin: '0 0 0.2rem 0' }}>
              Attendance History & Log
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Total of {filteredRecords.length} recorded lecture sessions.
            </span>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportCSV}
            disabled={filteredRecords.length === 0}
            style={{ fontSize: '0.78rem', padding: '0.4rem 0.8rem' }}
          >
            <IconDownload size={14} />
            <span>Export to CSV</span>
          </button>
        </div>

        {/* Filter Bar */}
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem', padding: '0.65rem 0.85rem', background: 'var(--bg-card-subtle)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-card)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Course:</span>
            <select
              className="input-field"
              value={filterSubjectId}
              onChange={(e) => setFilterSubjectId(e.target.value)}
              style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
            >
              <option value="all">All Courses</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.subject_code} — {s.subject_name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-muted)' }}>Status:</span>
            <select
              className="input-field"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ width: 'auto', padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
            >
              <option value="all">All Statuses</option>
              <option value="present">Present</option>
              <option value="od">On Duty (OD)</option>
              <option value="absent">Absent</option>
              <option value="cancelled">Class Off</option>
            </select>
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
            No past attendance records found matching current filters.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Course</th>
                  <th>Class Type</th>
                  <th>Your Status</th>
                  <th style={{ textAlign: 'right' }}>Quick Update</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong style={{ fontSize: '0.84rem' }}>{r.class_date}</strong>
                    </td>
                    <td>
                      <strong style={{ display: 'block', fontSize: '0.84rem' }}>{r.subjects?.subject_name || 'Course'}</strong>
                      <span style={{ fontSize: '0.72rem', color: 'var(--accent-primary)', fontFamily: 'var(--font-mono)' }}>
                        {r.subjects?.subject_code}
                      </span>
                    </td>
                    <td style={{ textTransform: 'capitalize', fontSize: '0.8rem' }}>
                      {r.class_type}
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          r.status === 'present'
                            ? 'badge-success'
                            : r.status === 'od'
                            ? 'badge-info'
                            : r.status === 'absent'
                            ? 'badge-danger'
                            : 'badge-warning'
                        }`}
                      >
                        {r.status === 'present'
                          ? 'Present'
                          : r.status === 'od'
                          ? 'On Duty'
                          : r.status === 'absent'
                          ? 'Absent'
                          : 'Class Off'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '3px' }}>
                        <button
                          type="button"
                          disabled={updatingRecordId === r.id}
                          onClick={() => handleInlineStatusUpdate(r.id, 'present')}
                          className="btn"
                          style={{
                            padding: '0.2rem 0.45rem',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: r.status === 'present' ? 'var(--status-success)' : 'var(--bg-card)',
                            color: r.status === 'present' ? '#ffffff' : 'var(--text-muted)',
                            border: '1px solid var(--border-card)',
                          }}
                          title="Mark Present"
                        >
                          P
                        </button>
                        <button
                          type="button"
                          disabled={updatingRecordId === r.id}
                          onClick={() => handleInlineStatusUpdate(r.id, 'absent')}
                          className="btn"
                          style={{
                            padding: '0.2rem 0.45rem',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            background: r.status === 'absent' ? 'var(--status-danger)' : 'var(--bg-card)',
                            color: r.status === 'absent' ? '#ffffff' : 'var(--text-muted)',
                            border: '1px solid var(--border-card)',
                          }}
                          title="Mark Absent"
                        >
                          A
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRecord(r.id)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-subtle)',
                            cursor: 'pointer',
                            padding: '0.2rem 0.35rem',
                          }}
                          title="Delete entry"
                        >
                          <IconX size={14} />
                        </button>
                      </div>
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
