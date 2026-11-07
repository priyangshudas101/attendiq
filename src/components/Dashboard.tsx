import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface SubjectStat {
  id: string;
  name: string;
  code: string;
  attended: number;
  od: number;
  missed: number;
  total: number;
  percentage: number;
  canMiss: number;
  mustAttend: number;
  schedule_days: number[];
  remainingLectures: number;
  maxAchievablePct: number;
  finalExamSkipBudget: number;
  isMathematicallyBarred: boolean;
}

interface TrendPoint {
  date: string;
  percentage: number;
  totalSessions: number;
}

interface DashboardProps {
  session: Session;
  onNavigateToAttendance: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ session, onNavigateToAttendance }) => {
  const [subjectStats, setSubjectStats] = useState<SubjectStat[]>([]);
  const [overallAttendance, setOverallAttendance] = useState<number>(100);
  const [totalAttended, setTotalAttended] = useState<number>(0);
  const [totalOD, setTotalOD] = useState<number>(0);
  const [totalClasses, setTotalClasses] = useState<number>(0);
  const [totalCanMiss, setTotalCanMiss] = useState<number>(0);
  const [totalMustAttend, setTotalMustAttend] = useState<number>(0);
  const [targetThreshold, setTargetThreshold] = useState<number>(75);
  const [department, setDepartment] = useState<string>('CSE Department');
  const [semesterEndDate, setSemesterEndDate] = useState<string>('');
  const [daysRemainingInTerm, setDaysRemainingInTerm] = useState<number>(0);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Simulator State
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [simPlanAttend, setSimPlanAttend] = useState<number>(0);
  const [simPlanMiss, setSimPlanMiss] = useState<number>(1);

  useEffect(() => {
    fetchDashboardMetrics();
  }, [session.user.id]);

  const calculateRemainingLectures = (scheduleDays: number[], endDateStr: string): number => {
    if (!endDateStr) return 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const endDate = new Date(endDateStr + 'T00:00:00');
    if (endDate <= today) return 0;

    let count = 0;
    const cur = new Date(today);
    cur.setDate(cur.getDate() + 1); // count starting tomorrow

    while (cur <= endDate) {
      if (scheduleDays.includes(cur.getDay())) {
        count++;
      }
      cur.setDate(cur.getDate() + 1);
    }
    return count;
  };

  const fetchDashboardMetrics = async () => {
    try {
      setLoading(true);
      setError(null);

      // 1. Fetch Profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('target_threshold, department')
        .eq('id', session.user.id)
        .single();

      const threshold = profile?.target_threshold ? Number(profile.target_threshold) : 75;
      setTargetThreshold(threshold);
      if (profile?.department) setDepartment(profile.department);

      const targetRatio = threshold / 100;

      // 2. Fetch Active Semester End Date
      const { data: semData } = await supabase
        .from('semesters')
        .select('end_date')
        .eq('student_id', session.user.id)
        .eq('status', 'active')
        .limit(1);

      let termEndDate = '';
      if (semData && semData.length > 0 && semData[0].end_date) {
        termEndDate = semData[0].end_date;
        setSemesterEndDate(termEndDate);

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const end = new Date(termEndDate + 'T00:00:00');
        const diffDays = Math.max(0, Math.ceil((end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
        setDaysRemainingInTerm(diffDays);
      }

      // 3. Fetch Subjects
      const { data: subjects, error: subError } = await supabase
        .from('subjects')
        .select('id, subject_name, subject_code, schedule_days')
        .eq('student_id', session.user.id)
        .order('subject_name', { ascending: true });

      if (subError) throw subError;

      // 4. Fetch Attendance Records
      const { data: records, error: recError } = await supabase
        .from('attendance_records')
        .select('id, subject_id, status, class_date')
        .eq('student_id', session.user.id)
        .neq('status', 'cancelled')
        .order('class_date', { ascending: true });

      if (recError) throw recError;

      const logs = records || [];
      let grandAttended = 0;
      let grandOD = 0;
      let grandMissed = 0;
      let aggregateCanMiss = 0;
      let aggregateMustAttend = 0;

      const stats: SubjectStat[] = (subjects || []).map((sub) => {
        const subLogs = logs.filter((l) => l.subject_id === sub.id);
        const presentCount = subLogs.filter((l) => l.status === 'present').length;
        const odCount = subLogs.filter((l) => l.status === 'od').length;
        const attended = presentCount + odCount;
        const missed = subLogs.filter((l) => l.status === 'absent').length;
        const total = attended + missed;

        let percentage = 100;
        let canMiss = 0;
        let mustAttend = 0;

        if (total > 0) {
          percentage = Math.round((attended / total) * 100);
          if (percentage >= threshold) {
            canMiss = Math.max(0, Math.floor((attended - targetRatio * total) / targetRatio));
            aggregateCanMiss += canMiss;
          } else {
            mustAttend = Math.max(0, Math.ceil((targetRatio * total - attended) / (1 - targetRatio)));
            aggregateMustAttend += mustAttend;
          }
        }

        // Exam Horizon Math
        const schedDays = sub.schedule_days || [1, 2, 3, 4, 5];
        const remainingLectures = calculateRemainingLectures(schedDays, termEndDate);
        const projectedTotalWithRemaining = total + remainingLectures;

        let maxAchievablePct = 100;
        if (projectedTotalWithRemaining > 0) {
          maxAchievablePct = Math.round(((attended + remainingLectures) / projectedTotalWithRemaining) * 100);
        }

        const isMathematicallyBarred = remainingLectures > 0 && maxAchievablePct < threshold;

        // Skip budget until final exam:
        // (attended + remainingLectures - skips) / (total + remainingLectures) >= targetRatio
        let finalExamSkipBudget = 0;
        if (projectedTotalWithRemaining > 0 && !isMathematicallyBarred) {
          const rawBudget = Math.floor(attended + remainingLectures - targetRatio * projectedTotalWithRemaining);
          finalExamSkipBudget = Math.max(0, Math.min(remainingLectures, rawBudget));
        }

        grandAttended += attended;
        grandOD += odCount;
        grandMissed += missed;

        return {
          id: sub.id,
          name: sub.subject_name,
          code: sub.subject_code,
          attended,
          od: odCount,
          missed,
          total,
          percentage,
          canMiss,
          mustAttend,
          schedule_days: schedDays,
          remainingLectures,
          maxAchievablePct,
          finalExamSkipBudget,
          isMathematicallyBarred,
        };
      });

      // Compute Trend
      const dateMap = new Map<string, { attended: number; total: number }>();
      logs.forEach((log) => {
        const prev = dateMap.get(log.class_date) || { attended: 0, total: 0 };
        const isCredited = log.status === 'present' || log.status === 'od';
        dateMap.set(log.class_date, {
          attended: prev.attended + (isCredited ? 1 : 0),
          total: prev.total + 1,
        });
      });

      let runningAttended = 0;
      let runningTotal = 0;
      const calculatedTrend: TrendPoint[] = [];

      Array.from(dateMap.keys()).sort().forEach((dateKey) => {
        const entry = dateMap.get(dateKey)!;
        runningAttended += entry.attended;
        runningTotal += entry.total;
        const currentRate = runningTotal > 0 ? Math.round((runningAttended / runningTotal) * 100) : 100;
        calculatedTrend.push({
          date: dateKey,
          percentage: currentRate,
          totalSessions: runningTotal,
        });
      });

      setTrendData(calculatedTrend);

      const grandTotal = grandAttended + grandMissed;
      const calculatedOverall = grandTotal > 0 ? Math.round((grandAttended / grandTotal) * 100) : 100;

      setSubjectStats(stats);
      setTotalAttended(grandAttended);
      setTotalOD(grandOD);
      setTotalClasses(grandTotal);
      setOverallAttendance(calculatedOverall);
      setTotalCanMiss(aggregateCanMiss);
      setTotalMustAttend(aggregateMustAttend);
    } catch (err: any) {
      setError(err.message || 'Failed to calculate telemetry metrics.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div style={{ padding: '3rem 0', color: 'var(--text-muted)' }}>Synthesizing telemetry...</div>;
  }

  const isCritical = overallAttendance < targetThreshold;
  const targetRatio = targetThreshold / 100;

  // Simulator Math
  let baseAttended = totalAttended;
  let baseTotal = totalClasses;
  let activeSubjectName = 'All Subjects (Aggregate)';

  if (selectedSubjectId !== 'all') {
    const found = subjectStats.find((s) => s.id === selectedSubjectId);
    if (found) {
      baseAttended = found.attended;
      baseTotal = found.total;
      activeSubjectName = `${found.name} (${found.code})`;
    }
  }

  const currentSimPct = baseTotal > 0 ? Math.round((baseAttended / baseTotal) * 100) : 100;
  const projectedAttended = baseAttended + simPlanAttend;
  const projectedTotal = baseTotal + simPlanAttend + simPlanMiss;
  const projectedPct = projectedTotal > 0 ? Math.round((projectedAttended / projectedTotal) * 100) : 100;
  const pctDelta = projectedPct - currentSimPct;

  let projectedCanMiss = 0;
  let projectedMustAttend = 0;
  if (projectedTotal > 0) {
    if (projectedPct >= targetThreshold) {
      projectedCanMiss = Math.max(0, Math.floor((projectedAttended - targetRatio * projectedTotal) / targetRatio));
    } else {
      projectedMustAttend = Math.max(0, Math.ceil((targetRatio * projectedTotal - projectedAttended) / (1 - targetRatio)));
    }
  }

  const willBeCritical = projectedPct < targetThreshold;

  // Chart Geometry
  const chartHeight = 160;
  const chartWidth = 600;
  const paddingX = 40;
  const paddingY = 25;

  const getYCoord = (val: number) => {
    const clamped = Math.max(40, Math.min(100, val));
    return chartHeight - paddingY - ((clamped - 40) / 60) * (chartHeight - paddingY * 2);
  };

  const thresholdY = getYCoord(targetThreshold);

  const pointsString = trendData.length > 1
    ? trendData
        .map((p, i) => {
          const x = paddingX + (i / (trendData.length - 1)) * (chartWidth - paddingX * 2);
          const y = getYCoord(p.percentage);
          return `${x},${y}`;
        })
        .join(' ')
    : '';

  return (
    <section>
      <div className="welcome-section">
        <div>
          <span className="eyebrow">ACADEMIC TELEMETRY</span>
          <h2>Command Overview</h2>
          <p>Institutional target: <strong>{targetThreshold}%</strong> minimum required attendance.</p>
        </div>
        <div className="semester-tag">3rd Semester · {department}</div>
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

      {/* Primary KPI Grid */}
      <div className="stats-grid">
        <article className="stat-card">
          <span className="stat-label">Overall Attendance</span>
          <strong
            className="stat-value"
            style={{ color: isCritical ? 'var(--color-danger)' : 'var(--color-success)' }}
          >
            {overallAttendance}%
          </strong>
          <span className="stat-description">
            {isCritical ? `Shortage: Below ${targetThreshold}% mandate` : `Compliant: Maintaining >= ${targetThreshold}%`}
          </span>
        </article>

        <article className="stat-card">
          <span className="stat-label">Classes Attended</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem' }}>
            <strong className="stat-value">{totalAttended}</strong>
            {totalOD > 0 && (
              <span style={{ fontSize: '0.78rem', color: '#818cf8', fontWeight: 600 }}>
                ({totalOD} OD)
              </span>
            )}
          </div>
          <span className="stat-description">Out of {totalClasses} logged sessions</span>
        </article>

        <article className="stat-card">
          <span className="stat-label">Classes You Can Miss</span>
          <strong
            className="stat-value"
            style={{ color: totalCanMiss > 0 ? 'var(--color-info)' : 'var(--text-muted)' }}
          >
            {totalCanMiss}
          </strong>
          <span className="stat-description">Without falling below {targetThreshold}%</span>
        </article>

        <article className="stat-card">
          <span className="stat-label">Classes You Must Attend</span>
          <strong
            className="stat-value"
            style={{ color: totalMustAttend > 0 ? 'var(--color-warning)' : 'var(--text-muted)' }}
          >
            {totalMustAttend}
          </strong>
          <span className="stat-description">In a row to recover {targetThreshold}%</span>
        </article>
      </div>

      {/* Exam Eligibility Horizon Radar */}
      <section
        style={{
          marginTop: '2rem',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.75rem',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
          <div>
            <span className="eyebrow">FINAL EXAM CLEARANCE</span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.15rem 0' }}>
              Semester Horizon & Exam Eligibility Radar
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
              Horizon cut-off: <strong>{semesterEndDate || 'Not Configured'}</strong> ({daysRemainingInTerm} calendar days remaining)
            </p>
          </div>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', backgroundColor: 'var(--bg-canvas)', padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)' }}>
            Mandate: <strong>{targetThreshold}% Hall Ticket Eligibility</strong>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                <th style={{ padding: '0.65rem 0.75rem' }}>Subject</th>
                <th style={{ padding: '0.65rem 0.75rem' }}>Current</th>
                <th style={{ padding: '0.65rem 0.75rem' }}>Remaining Lectures</th>
                <th style={{ padding: '0.65rem 0.75rem' }}>Ceiling (Max %)</th>
                <th style={{ padding: '0.65rem 0.75rem' }}>Pre-Exam Skip Budget</th>
                <th style={{ padding: '0.65rem 0.75rem', textAlign: 'right' }}>Eligibility Status</th>
              </tr>
            </thead>
            <tbody>
              {subjectStats.map((sub) => (
                <tr key={sub.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <td style={{ padding: '0.85rem 0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    {sub.name} <span style={{ color: '#818cf8', fontSize: '0.75rem' }}>({sub.code})</span>
                  </td>
                  <td style={{ padding: '0.85rem 0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                    {sub.total === 0 ? '—' : `${sub.percentage}%`}
                  </td>
                  <td style={{ padding: '0.85rem 0.75rem', color: 'var(--text-secondary)' }}>
                    <strong>{sub.remainingLectures}</strong> sessions
                  </td>
                  <td style={{ padding: '0.85rem 0.75rem', fontVariantNumeric: 'tabular-nums' }}>
                    <strong style={{ color: sub.isMathematicallyBarred ? 'var(--color-danger)' : '#a5b4fc' }}>
                      {sub.maxAchievablePct}%
                    </strong>
                  </td>
                  <td style={{ padding: '0.85rem 0.75rem' }}>
                    {sub.isMathematicallyBarred ? (
                      <span style={{ color: 'var(--color-danger)', fontWeight: 700 }}>0 skips (Deficit)</span>
                    ) : (
                      <span style={{ color: 'var(--color-info)', fontWeight: 700 }}>
                        {sub.finalExamSkipBudget} permissible skip{sub.finalExamSkipBudget === 1 ? '' : 's'}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '0.85rem 0.75rem', textAlign: 'right' }}>
                    {sub.isMathematicallyBarred ? (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '0.25rem 0.65rem',
                          borderRadius: '4px',
                          backgroundColor: 'var(--color-danger-bg)',
                          color: 'var(--color-danger)',
                          border: '1px solid var(--color-danger)',
                        }}
                      >
                        BARRED (CLAIM OD)
                      </span>
                    ) : sub.percentage < targetThreshold ? (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '0.25rem 0.65rem',
                          borderRadius: '4px',
                          backgroundColor: 'var(--color-warning-bg)',
                          color: 'var(--color-warning)',
                          border: '1px solid var(--color-warning)',
                        }}
                      >
                        RECOVERABLE
                      </span>
                    ) : (
                      <span
                        style={{
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          padding: '0.25rem 0.65rem',
                          borderRadius: '4px',
                          backgroundColor: 'var(--color-success-bg)',
                          color: 'var(--color-success)',
                          border: '1px solid var(--color-success)',
                        }}
                      >
                        HALL TICKET CLEAR
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Trajectory Graph */}
      <section
        style={{
          marginTop: '2rem',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.75rem',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
          <div>
            <span className="eyebrow">CHRONOLOGICAL PERFORMANCE</span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.15rem 0' }}>
              Attendance Trajectory Curve
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>
              Historical cumulative rate plotted against your {targetThreshold}% cutoff boundary.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.78rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <div style={{ width: '12px', height: '3px', background: '#4f46e5', borderRadius: '2px' }} />
              <span style={{ color: 'var(--text-secondary)' }}>Actual Rate (incl. OD)</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <div style={{ width: '12px', height: '2px', background: 'var(--color-danger)', borderTop: '2px dashed var(--color-danger)' }} />
              <span style={{ color: 'var(--text-muted)' }}>{targetThreshold}% Cutoff</span>
            </div>
          </div>
        </div>

        {trendData.length < 2 ? (
          <div
            style={{
              padding: '2.5rem',
              textAlign: 'center',
              backgroundColor: 'var(--bg-canvas)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)',
              fontSize: '0.85rem',
            }}
          >
            Log attendance across at least two distinct calendar dates to generate your trajectory telemetry curve.
          </div>
        ) : (
          <div style={{ width: '100%', overflowX: 'auto', backgroundColor: 'var(--bg-canvas)', borderRadius: 'var(--radius-sm)', padding: '1rem 0' }}>
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              style={{ width: '100%', height: 'auto', minWidth: '480px', display: 'block' }}
            >
              <line x1={paddingX} y1={getYCoord(100)} x2={chartWidth - paddingX} y2={getYCoord(100)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              <text x={paddingX - 8} y={getYCoord(100) + 4} fill="var(--text-muted)" fontSize="9" textAnchor="end">100%</text>

              <line x1={paddingX} y1={getYCoord(80)} x2={chartWidth - paddingX} y2={getYCoord(80)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              <text x={paddingX - 8} y={getYCoord(80) + 4} fill="var(--text-muted)" fontSize="9" textAnchor="end">80%</text>

              <line x1={paddingX} y1={getYCoord(60)} x2={chartWidth - paddingX} y2={getYCoord(60)} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              <text x={paddingX - 8} y={getYCoord(60) + 4} fill="var(--text-muted)" fontSize="9" textAnchor="end">60%</text>

              <line
                x1={paddingX}
                y1={thresholdY}
                x2={chartWidth - paddingX}
                y2={thresholdY}
                stroke="var(--color-danger)"
                strokeDasharray="4 4"
                strokeWidth="1.5"
              />
              <text x={chartWidth - paddingX + 6} y={thresholdY + 3} fill="var(--color-danger)" fontSize="9" fontWeight="700">
                {targetThreshold}%
              </text>

              <polyline
                fill="none"
                stroke="#6366f1"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={pointsString}
              />

              {trendData.map((p, i) => {
                const cx = paddingX + (i / (trendData.length - 1)) * (chartWidth - paddingX * 2);
                const cy = getYCoord(p.percentage);
                const isUnder = p.percentage < targetThreshold;

                return (
                  <g key={p.date}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r="4"
                      fill={isUnder ? 'var(--color-danger)' : '#6366f1'}
                      stroke="var(--bg-canvas)"
                      strokeWidth="2"
                    />
                    <text
                      x={cx}
                      y={chartHeight - 6}
                      fill="var(--text-muted)"
                      fontSize="8"
                      textAnchor="middle"
                    >
                      {p.date.slice(5)}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
      </section>

      {/* Simulator Panel */}
      <section
        style={{
          marginTop: '2rem',
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-lg)',
          padding: '1.75rem',
          boxShadow: 'var(--shadow-md)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
          <div>
            <span className="eyebrow">PREDICTIVE ENGINE</span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.15rem 0' }}>
              "What-If" Absence Simulator
            </h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              Project standing and safe skip counts before taking absence.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => { setSimPlanAttend(0); setSimPlanMiss(1); }}
              style={{
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                padding: '0.35rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              +1 Skip
            </button>
            <button
              type="button"
              onClick={() => { setSimPlanAttend(0); setSimPlanMiss(3); }}
              style={{
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                padding: '0.35rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              +3 Skips
            </button>
            <button
              type="button"
              onClick={() => { setSimPlanAttend(3); setSimPlanMiss(0); }}
              style={{
                background: 'var(--bg-canvas)',
                border: '1px solid var(--border-subtle)',
                color: 'var(--text-secondary)',
                padding: '0.35rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              +3 Attended
            </button>
            <button
              type="button"
              onClick={() => { setSimPlanAttend(0); setSimPlanMiss(0); }}
              style={{
                background: 'var(--color-danger-bg)',
                border: '1px solid var(--color-danger)',
                color: '#f87171',
                padding: '0.35rem 0.75rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reset
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              Target Subject
            </label>
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              style={{
                width: '100%',
                padding: '0.65rem 0.85rem',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '0.85rem',
              }}
            >
              <option value="all">All Subjects (Overall Standing)</option>
              {subjectStats.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name} ({sub.code})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              Attend Upcoming: <strong>+{simPlanAttend}</strong>
            </label>
            <input
              type="range"
              min="0"
              max="15"
              step="1"
              value={simPlanAttend}
              onChange={(e) => setSimPlanAttend(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-success)', cursor: 'pointer' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.4rem' }}>
              Skip Upcoming: <strong>+{simPlanMiss}</strong>
            </label>
            <input
              type="range"
              min="0"
              max="15"
              step="1"
              value={simPlanMiss}
              onChange={(e) => setSimPlanMiss(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--color-danger)', cursor: 'pointer' }}
            />
          </div>
        </div>

        {/* Prediction Output */}
        <div
          style={{
            backgroundColor: 'var(--bg-canvas)',
            border: willBeCritical
              ? '1px solid rgba(239, 68, 68, 0.4)'
              : '1px solid rgba(16, 185, 129, 0.4)',
            borderRadius: 'var(--radius-md)',
            padding: '1.25rem 1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '1rem',
          }}
        >
          <div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Simulated Target: <strong style={{ color: 'var(--text-primary)' }}>{activeSubjectName}</strong>
            </span>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginTop: '0.35rem' }}>
              <span style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>{currentSimPct}%</span>
              <span style={{ color: 'var(--text-muted)' }}>➔</span>
              <strong
                style={{
                  fontSize: '1.85rem',
                  fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums',
                  color: willBeCritical ? 'var(--color-danger)' : 'var(--color-success)',
                }}
              >
                {projectedPct}%
              </strong>
              <span
                style={{
                  fontSize: '0.85rem',
                  fontWeight: 700,
                  fontVariantNumeric: 'tabular-nums',
                  color: pctDelta > 0 ? 'var(--color-success)' : pctDelta < 0 ? 'var(--color-danger)' : 'var(--text-muted)',
                }}
              >
                ({pctDelta > 0 ? `+${pctDelta}` : pctDelta}%)
              </span>
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span
              style={{
                display: 'inline-block',
                padding: '0.35rem 0.8rem',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.04em',
                backgroundColor: willBeCritical ? 'var(--color-danger-bg)' : 'var(--color-success-bg)',
                color: willBeCritical ? 'var(--color-danger)' : 'var(--color-success)',
                border: willBeCritical ? '1px solid var(--color-danger)' : '1px solid var(--color-success)',
                marginBottom: '0.4rem',
              }}
            >
              {willBeCritical ? 'CRITICAL SHORTAGE' : 'STABLE COMPLIANCE'}
            </span>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
              {willBeCritical ? (
                <span>
                  Must attend next <strong style={{ color: 'var(--color-warning)' }}>{projectedMustAttend}</strong> classes consecutively to recover {targetThreshold}%.
                </span>
              ) : (
                <span>
                  Permits <strong style={{ color: 'var(--color-info)' }}>{projectedCanMiss}</strong> additional permissible absence{projectedCanMiss === 1 ? '' : 's'}.
                </span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Course Breakdown */}
      <section style={{ marginTop: '2.5rem' }}>
        <div className="section-heading">
          <div>
            <span className="eyebrow">COURSE BREAKDOWN</span>
            <h2>Subject Standing</h2>
          </div>
          <button className="text-button" onClick={onNavigateToAttendance}>
            + Log Session
          </button>
        </div>

        {subjectStats.length === 0 ? (
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
            No subjects configured. Add courses in the Subjects tab.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            {subjectStats.map((sub) => {
              const isSubCritical = sub.total > 0 && sub.percentage < targetThreshold;
              const isZeroMargin = sub.total > 0 && sub.percentage >= targetThreshold && sub.canMiss === 0;

              return (
                <article
                  key={sub.id}
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: isSubCritical
                      ? '1px solid rgba(239, 68, 68, 0.3)'
                      : '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)',
                    padding: '1.25rem 1.5rem',
                    boxShadow: 'var(--shadow-sm)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.85rem',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <strong style={{ fontSize: '1rem', color: 'var(--text-primary)', display: 'block' }}>
                        {sub.name}
                      </strong>
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {sub.code} · {sub.attended} attended {sub.od > 0 && `(${sub.od} OD) `}/ {sub.missed} missed ({sub.total} total)
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                      {sub.total === 0 ? (
                        <span
                          style={{
                            fontSize: '0.75rem',
                            padding: '0.3rem 0.65rem',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--bg-canvas)',
                            color: 'var(--text-muted)',
                            border: '1px solid var(--border-subtle)',
                          }}
                        >
                          No sessions yet
                        </span>
                      ) : isSubCritical ? (
                        <span
                          style={{
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            padding: '0.3rem 0.75rem',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: 'var(--color-danger-bg)',
                            color: 'var(--color-danger)',
                            border: '1px solid var(--color-danger)',
                          }}
                        >
                          Attend next {sub.mustAttend} class{sub.mustAttend > 1 ? 'es' : ''}
                        </span>
                      ) : isZeroMargin ? (
                        <span
                          style={{
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            padding: '0.3rem 0.75rem',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: 'var(--color-warning-bg)',
                            color: 'var(--color-warning)',
                            border: '1px solid var(--color-warning)',
                          }}
                        >
                          Zero margin: Don't miss next
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            padding: '0.3rem 0.75rem',
                            borderRadius: 'var(--radius-sm)',
                            backgroundColor: 'var(--color-success-bg)',
                            color: 'var(--color-success)',
                            border: '1px solid var(--color-success)',
                          }}
                        >
                          Can miss {sub.canMiss} class{sub.canMiss > 1 ? 'es' : ''}
                        </span>
                      )}

                      <strong
                        style={{
                          fontSize: '1.25rem',
                          fontWeight: 800,
                          minWidth: '60px',
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          color: isSubCritical ? 'var(--color-danger)' : 'var(--text-primary)',
                        }}
                      >
                        {sub.total === 0 ? '—' : `${sub.percentage}%`}
                      </strong>
                    </div>
                  </div>

                  <div
                    style={{
                      height: '6px',
                      borderRadius: '9999px',
                      backgroundColor: 'var(--bg-canvas)',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        height: '100%',
                        width: `${sub.total === 0 ? 0 : sub.percentage}%`,
                        backgroundColor: isSubCritical ? 'var(--color-danger)' : 'var(--accent-primary)',
                        borderRadius: '9999px',
                        transition: 'width 0.4s ease',
                      }}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
};