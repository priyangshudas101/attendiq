import React, { useState, useEffect, useMemo } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import {
  IconSubjects,
  IconAttendance,
} from './Icons';

interface DashboardProps {
  session: Session;
  onNavigateToAttendance?: () => void;
  onNavigateToSubjects?: () => void;
  onNavigateToCR?: () => void;
  userRole?: 'student' | 'cr' | 'admin';
  userName?: string;
}

interface AttendanceRecord {
  id: string;
  status: 'present' | 'absent' | 'od';
  createdAt: string;
  subjectCode: string;
  subjectName: string;
  sessionDate: string;
}

interface EnrolledSubject {
  id: string;
  code: string;
  name: string;
}

interface SubjectStat {
  code: string;
  name: string;
  attended: number;
  total: number;
  percentage: number;
  missBudget: number;
  recoveryCount: number;
  hasSessions: boolean;
}

export const Dashboard: React.FC<DashboardProps> = ({
  session,
  onNavigateToAttendance,
  onNavigateToSubjects,
  userName = 'Student',
}) => {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [enrolledSubjects, setEnrolledSubjects] = useState<EnrolledSubject[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    fetchDashboardData();
  }, [session.user.id]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      // 1. Fetch user's registered subjects from Supabase
      const { data: semData } = await supabase
        .from('semesters')
        .select('id')
        .eq('student_id', session.user.id)
        .eq('status', 'active')
        .limit(1);

      let subjectsList: EnrolledSubject[] = [];

      if (semData && semData.length > 0) {
        const { data: subData } = await supabase
          .from('subjects')
          .select('id, subject_name, subject_code')
          .eq('semester_id', semData[0].id)
          .order('subject_name', { ascending: true });

        if (subData && subData.length > 0) {
          subjectsList = subData.map((s: any) => ({
            id: s.id,
            code: s.subject_code || '',
            name: s.subject_name || '',
          }));
        }
      }

      setEnrolledSubjects(subjectsList);

      // 2. Fetch real attendance records for this user from Supabase (NO fake seeds!)
      const { data: attData } = await supabase
        .from('session_attendance')
        .select(`
          id,
          status,
          created_at,
          class_sessions (
            subject_code,
            subject_name,
            session_date
          )
        `)
        .eq('student_id', session.user.id);

      if (attData && attData.length > 0) {
        const mapped: AttendanceRecord[] = attData.map((row: any) => ({
          id: row.id,
          status: row.status,
          createdAt: row.created_at,
          subjectCode: row.class_sessions?.subject_code || 'General',
          subjectName: row.class_sessions?.subject_name || 'Lecture',
          sessionDate: row.class_sessions?.session_date || new Date().toISOString().split('T')[0],
        }));
        setRecords(mapped);
      } else {
        // Completely empty for a new user!
        setRecords([]);
      }
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  // Overall calculations based STRICTLY on real data
  const metrics = useMemo(() => {
    const total = records.length;
    const attended = records.filter((r) => r.status === 'present' || r.status === 'od').length;

    if (total === 0) {
      return {
        total: 0,
        attended: 0,
        rate: null, // null for new user with zero records
        missAllowance: 0,
        recoveryNeeded: 0,
        isCompliant: true,
        hasData: false,
      };
    }

    const rate = Math.round((attended / total) * 100);
    const missAllowance = Math.max(0, Math.floor((4 * attended - 3 * total) / 3));
    const recoveryNeeded = rate >= 75 ? 0 : Math.max(0, 3 * total - 4 * attended);

    return {
      total,
      attended,
      rate,
      missAllowance,
      recoveryNeeded,
      isCompliant: rate >= 75,
      hasData: true,
    };
  }, [records]);

  // Subject statistics matching enrolled subjects and real records
  const subjectStats = useMemo<SubjectStat[]>(() => {
    // If user has registered subjects, use those as the baseline
    const statsMap: { [key: string]: { name: string; attended: number; total: number } } = {};

    enrolledSubjects.forEach((sub) => {
      statsMap[sub.code || sub.name] = {
        name: sub.name,
        attended: 0,
        total: 0,
      };
    });

    // Populate actual attended/total from real attendance records
    records.forEach((r) => {
      const key = r.subjectCode || r.subjectName;
      if (!statsMap[key]) {
        statsMap[key] = {
          name: r.subjectName,
          attended: 0,
          total: 0,
        };
      }
      statsMap[key].total += 1;
      if (r.status === 'present' || r.status === 'od') {
        statsMap[key].attended += 1;
      }
    });

    return Object.keys(statsMap).map((code) => {
      const item = statsMap[code];
      const hasSessions = item.total > 0;
      const pct = hasSessions ? Math.round((item.attended / item.total) * 100) : 0;
      const miss = Math.max(0, Math.floor((4 * item.attended - 3 * item.total) / 3));
      const rec = pct >= 75 ? 0 : Math.max(0, 3 * item.total - 4 * item.attended);

      return {
        code,
        name: item.name,
        attended: item.attended,
        total: item.total,
        percentage: pct,
        missBudget: miss,
        recoveryCount: rec,
        hasSessions,
      };
    });
  }, [enrolledSubjects, records]);

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '5rem 0', color: 'var(--text-subtle)' }}>
        Loading dashboard...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', paddingBottom: '3rem' }}>
      
      {/* 1. CLEAN MINIMALIST HEADER */}
      <section style={{ paddingTop: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span className="eyebrow" style={{ display: 'block', marginBottom: '0.25rem' }}>
              DHEMAJI ENGINEERING COLLEGE
            </span>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-main)', margin: 0 }}>
              Dashboard
            </h1>
            <p style={{ marginTop: '0.35rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
              Welcome, <strong>{userName}</strong>. Track your attendance and examination eligibility.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.65rem' }}>
            {onNavigateToSubjects && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onNavigateToSubjects}
              >
                <IconSubjects size={15} />
                <span>Subjects</span>
              </button>
            )}

            {onNavigateToAttendance && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onNavigateToAttendance}
              >
                <IconAttendance size={15} />
                <span>Mark Attendance</span>
              </button>
            )}
          </div>
        </div>

        {/* 2. CORE METRIC STRIP (Airy, Simple, Real Data Only) */}
        <div className="metric-ribbon" style={{ marginTop: '1.5rem' }}>
          {/* Card 1: Overall Rate */}
          <div className="metric-ribbon-col">
            <span className="metric-ribbon-label">Overall Attendance</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
              <span
                className="metric-ribbon-val"
                style={{
                  color: metrics.hasData
                    ? metrics.isCompliant
                      ? 'var(--status-success)'
                      : 'var(--status-danger)'
                    : 'var(--text-subtle)',
                }}
              >
                {metrics.hasData ? `${metrics.rate}%` : '--%'}
              </span>
              {metrics.hasData && (
                <span className={`badge ${metrics.isCompliant ? 'badge-success' : 'badge-danger'}`}>
                  {metrics.isCompliant ? 'Eligible' : 'Shortage'}
                </span>
              )}
            </div>
            <span className="metric-ribbon-sub">
              {metrics.hasData ? 'Mandate: 75% cutoff' : 'No attendance logged yet'}
            </span>
          </div>

          {/* Card 2: Classes Attended */}
          <div className="metric-ribbon-col">
            <span className="metric-ribbon-label">Classes Attended</span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.3rem' }}>
              <span className="metric-ribbon-val">
                {metrics.attended}
              </span>
              <span style={{ fontSize: '1rem', color: 'var(--text-subtle)', fontWeight: 600 }}>
                / {metrics.total}
              </span>
            </div>
            <span className="metric-ribbon-sub">
              Total lectures conducted
            </span>
          </div>

          {/* Card 3: Permissible Absences */}
          <div className="metric-ribbon-col">
            <span className="metric-ribbon-label">Safe Leaves</span>
            <span
              className="metric-ribbon-val"
              style={{ color: metrics.missAllowance > 0 ? 'var(--status-success)' : 'var(--text-muted)' }}
            >
              {metrics.missAllowance}
            </span>
            <span className="metric-ribbon-sub">
              Allowed without dropping &lt; 75%
            </span>
          </div>

          {/* Card 4: Classes Needed */}
          <div className="metric-ribbon-col">
            <span className="metric-ribbon-label">Classes Needed</span>
            <span
              className="metric-ribbon-val"
              style={{ color: metrics.recoveryNeeded > 0 ? 'var(--status-danger)' : 'var(--text-main)' }}
            >
              {metrics.recoveryNeeded > 0 ? `+${metrics.recoveryNeeded}` : '0'}
            </span>
            <span className="metric-ribbon-sub">
              {metrics.recoveryNeeded > 0 ? 'Required for 75% eligibility' : 'Zero shortage deficit'}
            </span>
          </div>
        </div>
      </section>

      {/* 3. COURSES ATTENDANCE SECTION */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
              Courses & Subjects
            </h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Subject-wise attendance breakdown
            </span>
          </div>

          {onNavigateToSubjects && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onNavigateToSubjects}
              style={{ fontSize: '0.78rem', padding: '0.4rem 0.85rem' }}
            >
              + Manage Subjects
            </button>
          )}
        </div>

        {/* Empty State for New User */}
        {subjectStats.length === 0 ? (
          <div className="surface" style={{ padding: '3rem 2rem', textAlign: 'center' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--bg-card-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto', color: 'var(--text-subtle)' }}>
              <IconSubjects size={24} />
            </div>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 0.5rem 0' }}>
              No subjects registered yet
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto 1.5rem auto', lineHeight: 1.5 }}>
              Add your semester subjects to start tracking subject-wise attendance and exam clearance.
            </p>
            {onNavigateToSubjects && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onNavigateToSubjects}
              >
                + Add Your Enrolled Subjects
              </button>
            )}
          </div>
        ) : (
          /* Clean 2-column or 3-column Course Grid */
          <div className="course-grid">
            {subjectStats.map((sub) => {
              const isEligible = sub.hasSessions ? sub.percentage >= 75 : true;

              return (
                <div key={sub.code} className="course-card">
                  <div>
                    <div className="course-card-top">
                      <span className="course-code-pill">
                        {sub.code}
                      </span>
                      {sub.hasSessions ? (
                        <span className={`course-pct-pill ${isEligible ? 'safe' : 'danger'}`}>
                          {sub.percentage}%
                        </span>
                      ) : (
                        <span className="badge" style={{ background: 'var(--bg-card-subtle)', color: 'var(--text-subtle)' }}>
                          No Sessions
                        </span>
                      )}
                    </div>

                    <h3 className="course-card-title">
                      {sub.name}
                    </h3>
                  </div>

                  <div>
                    {/* Clean Progress Bar */}
                    <div className="split-track">
                      <div
                        className={`split-track-fill ${isEligible ? 'safe' : 'danger'}`}
                        style={{ width: `${sub.hasSessions ? Math.min(100, sub.percentage) : 0}%` }}
                      />
                    </div>

                    <div className="course-card-footer">
                      <span style={{ color: 'var(--text-muted)' }}>
                        Attended: <strong style={{ color: 'var(--text-main)' }}>{sub.attended}/{sub.total}</strong>
                      </span>

                      {sub.hasSessions ? (
                        isEligible ? (
                          <span style={{ color: 'var(--status-success)', fontWeight: 700 }}>
                            {sub.missBudget > 0 ? `+${sub.missBudget} Safe` : 'On Track'}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--status-danger)', fontWeight: 800 }}>
                            Need +{sub.recoveryCount}
                          </span>
                        )
                      ) : (
                        <span style={{ color: 'var(--text-subtle)' }}>0 Lectures</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. RECENT ACTIVITY SECTION */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', margin: 0 }}>
              Recent Activity
            </h2>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Latest attendance check-ins
            </span>
          </div>

          {onNavigateToAttendance && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onNavigateToAttendance}
              style={{ fontSize: '0.78rem', padding: '0.4rem 0.85rem' }}
            >
              View Full Ledger →
            </button>
          )}
        </div>

        {records.length === 0 ? (
          <div className="surface" style={{ padding: '2.5rem 1.5rem', textAlign: 'center' }}>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', margin: '0 0 1rem 0' }}>
              No attendance records logged yet.
            </p>
            {onNavigateToAttendance && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onNavigateToAttendance}
              >
                Log Today's Attendance
              </button>
            )}
          </div>
        ) : (
          <div className="surface" style={{ overflow: 'hidden' }}>
            <table className="portal-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Subject</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {records.slice(0, 5).map((rec) => (
                  <tr key={rec.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                      {rec.sessionDate}
                    </td>
                    <td>
                      <strong style={{ color: 'var(--text-main)' }}>{rec.subjectName}</strong>
                      <span style={{ fontSize: '0.74rem', color: 'var(--text-subtle)', marginLeft: '0.5rem', fontFamily: 'var(--font-mono)' }}>
                        {rec.subjectCode}
                      </span>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          rec.status === 'present'
                            ? 'badge-success'
                            : rec.status === 'od'
                            ? 'badge-info'
                            : 'badge-danger'
                        }`}
                      >
                        {rec.status.toUpperCase()}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

    </div>
  );
};
