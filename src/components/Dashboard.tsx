import React, { useState, useEffect, useMemo } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { ensureStudentSubjects, DEFAULT_CSE_SUBJECTS } from '../lib/subjectsService';
import type { EnrolledSubject } from '../lib/subjectsService';
import {
  IconCheck,
  IconCalendar,
  IconShieldCheck,
  IconSparkles,
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
  subjectId: string;
  subjectCode: string;
  subjectName: string;
  sessionDate: string;
  classType: string;
  status: 'present' | 'absent' | 'od' | 'cancelled';
  createdAt?: string;
}

interface TodayClassSlot {
  id: string;
  subjectId: string;
  code: string;
  name: string;
  time: string;
  slotName: string;
  room: string;
  crStatus: 'conducted' | 'cancelled' | 'upcoming';
  crNote?: string;
  studentStatus: 'present' | 'absent' | 'od' | 'pending';
}

interface SubjectStat {
  id: string;
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
  const [todayClasses, setTodayClasses] = useState<TodayClassSlot[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active Deck Tab: 'routine' | 'courses' | 'forecaster' | 'admitpass' | 'ledger'
  const [activeDeck, setActiveDeck] = useState<
    'routine' | 'courses' | 'forecaster' | 'admitpass' | 'ledger'
  >('routine');

  // Interactive Target Goal: 75, 80, 85, 90
  const [targetGoal, setTargetGoal] = useState<number>(75);

  // What-If Simulator missed count
  const [simulatedMisses, setSimulatedMisses] = useState<number>(1);

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  useEffect(() => {
    fetchDashboardData();
  }, [session.user.id]);

  const fetchDashboardData = async () => {
    try {
      // 1. Fetch user registered subjects (auto-initializes standard DEC curriculum if empty)
      const subs = await ensureStudentSubjects(session.user.id);
      setEnrolledSubjects(subs);

      // 2. Fetch real student attendance records from Supabase attendance_records table
      const { data: attData, error: attErr } = await supabase
        .from('attendance_records')
        .select(`
          id,
          subject_id,
          class_date,
          class_type,
          status,
          created_at,
          subjects (
            id,
            subject_name,
            subject_code
          )
        `)
        .eq('student_id', session.user.id)
        .order('class_date', { ascending: false });

      if (attErr) {
        console.warn('Attendance records fetch error:', attErr.message);
      }

      const mappedRecords: AttendanceRecord[] = (attData || []).map((row: any) => ({
        id: row.id,
        subjectId: row.subject_id,
        subjectCode: row.subjects?.subject_code || '---',
        subjectName: row.subjects?.subject_name || 'Course',
        sessionDate: row.class_date,
        classType: row.class_type || 'regular',
        status: row.status,
        createdAt: row.created_at,
      }));
      setRecords(mappedRecords);

      // 3. Fetch today's CR updates from class_sessions
      const todayStr = new Date().toISOString().split('T')[0];
      const { data: crSessions } = await supabase
        .from('class_sessions')
        .select('*')
        .eq('session_date', todayStr);

      // 4. Build Today's Routine slots
      const todayDateObj = new Date();
      const currentDay = todayDateObj.getDay(); // 0: Sun, 1: Mon, ... 6: Sat
      const effectiveDay = currentDay === 0 ? 1 : currentDay; // On Sunday, preview Monday

      // Match enrolled subjects scheduled for today
      const todaysCourses = subs.filter(
        (s) => s.schedule_days && s.schedule_days.includes(effectiveDay)
      );

      const displayList = todaysCourses.length > 0 ? todaysCourses : subs.slice(0, 5);

      const slots: TodayClassSlot[] = displayList.map((sub, idx) => {
        // Fallback timetable metadata from DEFAULT_CSE_SUBJECTS
        const meta = DEFAULT_CSE_SUBJECTS.find((d) => d.code === sub.subject_code) || {
          time: `0${9 + idx}:00 - 1${idx}:00 AM`,
          slot: `Period ${idx + 1}`,
          room: 'Room 204',
        };

        // Match CR status if posted for today
        const crEntry = (crSessions || []).find(
          (cr: any) =>
            cr.subject_code === sub.subject_code ||
            (cr.subject_name && cr.subject_name.toLowerCase() === sub.subject_name.toLowerCase())
        );

        let crStatus: 'conducted' | 'cancelled' | 'upcoming' = 'upcoming';
        let crNote = '';

        if (crEntry) {
          if (crEntry.status === 'conducted') crStatus = 'conducted';
          else if (crEntry.status === 'cancelled') crStatus = 'cancelled';
          crNote = crEntry.notes || '';
        }

        // Match student's marked attendance for today
        const existingRec = mappedRecords.find(
          (r) => r.subjectId === sub.id && r.sessionDate === todayStr
        );

        let studentStatus: 'present' | 'absent' | 'od' | 'pending' = 'pending';
        if (existingRec) {
          studentStatus = existingRec.status as 'present' | 'absent' | 'od';
        }

        return {
          id: `slot-${sub.id}`,
          subjectId: sub.id,
          code: sub.subject_code,
          name: sub.subject_name,
          time: meta.time,
          slotName: meta.slot,
          room: meta.room,
          crStatus,
          crNote,
          studentStatus,
        };
      });

      setTodayClasses(slots);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  // Math helper for calculating safe miss allowance or classes needed for target
  const calculateNeedForTarget = (attended: number, total: number, target: number) => {
    if (total === 0) return { needed: 0, margin: 0, rate: 0 };
    const rate = Math.round((attended / total) * 100);
    const frac = target / 100;

    if (rate < target) {
      const needed = Math.max(0, Math.ceil((frac * total - attended) / (1 - frac)));
      return { needed, margin: 0, rate };
    } else {
      const margin = Math.max(0, Math.floor((attended - frac * total) / frac));
      return { needed: 0, margin, rate };
    }
  };

  // Overall calculations based STRICTLY on real attendance records
  const metrics = useMemo(() => {
    const total = records.length;
    const attended = records.filter((r) => r.status === 'present' || r.status === 'od').length;

    if (total === 0) {
      return {
        total: 0,
        attended: 0,
        rate: null, // null for fresh user with 0 records
        at75: { needed: 0, margin: 0, rate: 0 },
        atSelected: { needed: 0, margin: 0, rate: 0 },
        at85: { needed: 0, margin: 0, rate: 0 },
        isCompliant: true,
        hasData: false,
      };
    }

    const rate = Math.round((attended / total) * 100);
    const at75 = calculateNeedForTarget(attended, total, 75);
    const atSelected = calculateNeedForTarget(attended, total, targetGoal);
    const at85 = calculateNeedForTarget(attended, total, 85);

    return {
      total,
      attended,
      rate,
      at75,
      atSelected,
      at85,
      isCompliant: rate >= 75,
      hasData: true,
    };
  }, [records, targetGoal]);

  // Subject statistics matching enrolled subjects and real attendance records
  const subjectStats = useMemo<SubjectStat[]>(() => {
    const statsMap: {
      [key: string]: { id: string; name: string; attended: number; total: number };
    } = {};

    enrolledSubjects.forEach((sub) => {
      statsMap[sub.subject_code] = {
        id: sub.id,
        name: sub.subject_name,
        attended: 0,
        total: 0,
      };
    });

    // Accumulate real attendance records
    records.forEach((r) => {
      const code = r.subjectCode;
      if (!statsMap[code]) {
        statsMap[code] = {
          id: r.subjectId,
          name: r.subjectName,
          attended: 0,
          total: 0,
        };
      }
      statsMap[code].total += 1;
      if (r.status === 'present' || r.status === 'od') {
        statsMap[code].attended += 1;
      }
    });

    return Object.keys(statsMap).map((code) => {
      const item = statsMap[code];
      const hasSessions = item.total > 0;
      const pct = hasSessions ? Math.round((item.attended / item.total) * 100) : 0;
      const req = calculateNeedForTarget(item.attended, item.total, 75);

      return {
        id: item.id,
        code,
        name: item.name,
        attended: item.attended,
        total: item.total,
        percentage: pct,
        missBudget: req.margin,
        recoveryCount: req.needed,
        hasSessions,
      };
    });
  }, [enrolledSubjects, records]);

  // Fast Check-In Handler: 1-Click Punch into Supabase attendance_records table
  const handlePunchClass = async (slotId: string, status: 'present' | 'absent' | 'od') => {
    const slot = todayClasses.find((s) => s.id === slotId);
    if (!slot) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const newStatus = slot.studentStatus === status ? 'pending' : status;

    try {
      if (newStatus === 'pending') {
        // Clear check-in from database
        await supabase
          .from('attendance_records')
          .delete()
          .eq('student_id', session.user.id)
          .eq('subject_id', slot.subjectId)
          .eq('class_date', todayStr);

        setTodayClasses((prev) =>
          prev.map((c) => (c.id === slotId ? { ...c, studentStatus: 'pending' } : c))
        );
        triggerToast(`Cleared check-in for ${slot.code}`);
      } else {
        // Upsert into Supabase attendance_records so it immediately shows in Attendance tab!
        const { error: upsertErr } = await supabase
          .from('attendance_records')
          .upsert(
            {
              student_id: session.user.id,
              subject_id: slot.subjectId,
              class_date: todayStr,
              class_type: 'regular',
              status: newStatus,
            },
            {
              onConflict: 'student_id,subject_id,class_date',
            }
          );

        if (upsertErr) throw upsertErr;

        setTodayClasses((prev) =>
          prev.map((c) => (c.id === slotId ? { ...c, studentStatus: newStatus } : c))
        );
        triggerToast(`✓ Marked ${slot.code} as ${newStatus.toUpperCase()}! (Saved to Attendance)`);
      }

      // Refresh records to sync metric cards and recent ledger immediately
      await fetchDashboardData();
    } catch (err: any) {
      console.error('Punch error:', err);
      triggerToast('Error saving attendance: ' + err.message);
    }
  };

  // 1-Click Mark All Conducted / Scheduled Classes as Present
  const handleMarkAllPresent = async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const eligibleSlots = todayClasses.filter((s) => s.crStatus !== 'cancelled');

    if (eligibleSlots.length === 0) {
      triggerToast('No active classes scheduled today to mark present.');
      return;
    }

    try {
      const rows = eligibleSlots.map((s) => ({
        student_id: session.user.id,
        subject_id: s.subjectId,
        class_date: todayStr,
        class_type: 'regular' as const,
        status: 'present' as const,
      }));

      const { error: batchErr } = await supabase
        .from('attendance_records')
        .upsert(rows, {
          onConflict: 'student_id,subject_id,class_date',
        });

      if (batchErr) throw batchErr;

      await fetchDashboardData();
      triggerToast('⚡ All scheduled classes marked PRESENT! (Saved to Attendance)');
    } catch (err: any) {
      triggerToast('Failed to mark all: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '5rem 0', color: 'var(--text-subtle)' }}>
        Loading dashboard & routine...
      </div>
    );
  }

  // Today formatted
  const todayFormatted = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', paddingBottom: '3.5rem' }}>
      
      {/* Toast Notification */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: '4.5rem',
            right: '1.5rem',
            zIndex: 9999,
            backgroundColor: 'var(--brand-600)',
            color: '#ffffff',
            padding: '0.75rem 1.25rem',
            borderRadius: 'var(--radius-lg)',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
            fontSize: '0.85rem',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <IconCheck size={16} />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. CLEAN INSTITUTIONAL HEADER */}
      <section style={{ paddingTop: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <span className="eyebrow" style={{ display: 'block', marginBottom: '0.25rem' }}>
              DHEMAJI ENGINEERING COLLEGE • CSE
            </span>
            <h1 style={{ fontSize: '1.9rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-main)', margin: 0 }}>
              Dashboard
            </h1>
            <p style={{ marginTop: '0.35rem', fontSize: '0.88rem', color: 'var(--text-muted)' }}>
              Welcome back, <strong>{userName}</strong>. Today is {todayFormatted}.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.65rem' }}>
            <button
              type="button"
              className={`btn ${activeDeck === 'routine' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveDeck('routine')}
            >
              <IconCalendar size={15} />
              <span>Today's Routine</span>
            </button>

            {onNavigateToAttendance && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onNavigateToAttendance}
              >
                <IconAttendance size={15} />
                <span>Attendance Ledger</span>
              </button>
            )}

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
          </div>
        </div>

        {/* 2. CORE METRIC STRIP (Airy, Simple, Real Data Only) */}
        <div className="metric-ribbon" style={{ marginTop: '1.5rem' }}>
          {/* Card 1: Overall Rate */}
          <div className="metric-ribbon-col">
            <span className="metric-ribbon-label">Overall Attendance</span>
            <div className="metric-ribbon-value-row">
              <span className="metric-ribbon-value" style={{ color: metrics.hasData ? (metrics.isCompliant ? 'var(--status-success)' : 'var(--status-danger)') : 'var(--text-main)' }}>
                {metrics.hasData ? `${metrics.rate}%` : '--%'}
              </span>
              <span
                className={`badge ${
                  metrics.hasData
                    ? metrics.isCompliant
                      ? 'badge-success'
                      : 'badge-danger'
                    : 'badge-info'
                }`}
                style={{ fontSize: '0.7rem' }}
              >
                {metrics.hasData
                  ? metrics.isCompliant
                    ? 'On Track'
                    : 'Shortage'
                  : 'New Account'}
              </span>
            </div>
            <span className="metric-ribbon-sub">
              {metrics.hasData
                ? metrics.isCompliant
                  ? 'Meets ASTU 75% criterion'
                  : 'Below mandatory 75% threshold'
                : 'Log your first class to calculate'}
            </span>
          </div>

          {/* Card 2: Lectures Attended */}
          <div className="metric-ribbon-col">
            <span className="metric-ribbon-label">Lectures Attended</span>
            <div className="metric-ribbon-value-row">
              <span className="metric-ribbon-value">
                {metrics.attended} <span style={{ fontSize: '1.1rem', color: 'var(--text-subtle)' }}>/ {metrics.total}</span>
              </span>
            </div>
            <span className="metric-ribbon-sub">
              {metrics.hasData ? 'Total verified lectures' : '0 recorded sessions'}
            </span>
          </div>

          {/* Card 3: Safe Leaves Allowance */}
          <div className="metric-ribbon-col">
            <span className="metric-ribbon-label">Safe Leaves Available</span>
            <div className="metric-ribbon-value-row">
              <span
                className="metric-ribbon-value"
                style={{ color: metrics.at75.margin > 0 ? 'var(--status-success)' : 'var(--text-main)' }}
              >
                {metrics.hasData ? `+${metrics.at75.margin}` : '0'}
              </span>
              {metrics.at75.margin > 0 && (
                <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>Permissible</span>
              )}
            </div>
            <span className="metric-ribbon-sub">
              Classes you can skip safely above 75%
            </span>
          </div>

          {/* Card 4: Classes Needed */}
          <div className="metric-ribbon-col">
            <span className="metric-ribbon-label">Classes Needed for 75%</span>
            <div className="metric-ribbon-value-row">
              <span
                className="metric-ribbon-value"
                style={{ color: metrics.at75.needed > 0 ? 'var(--status-danger)' : 'var(--status-success)' }}
              >
                {metrics.hasData ? (metrics.at75.needed > 0 ? `+${metrics.at75.needed}` : '0') : '0'}
              </span>
              {metrics.at75.needed > 0 && (
                <span className="badge badge-danger" style={{ fontSize: '0.7rem' }}>Action Req.</span>
              )}
            </div>
            <span className="metric-ribbon-sub">
              {metrics.at75.needed > 0
                ? 'Consecutive attendances to recover'
                : 'Eligibility threshold satisfied'}
            </span>
          </div>
        </div>
      </section>

      {/* 3. SEGMENTED INTERACTIVE DECK BAR */}
      <div className="deck-bar">
        <button
          type="button"
          className={`deck-tab-btn ${activeDeck === 'routine' ? 'active' : ''}`}
          onClick={() => setActiveDeck('routine')}
        >
          <IconCalendar size={16} />
          <span>Today's Routine & Fast Check-In</span>
        </button>

        <button
          type="button"
          className={`deck-tab-btn ${activeDeck === 'courses' ? 'active' : ''}`}
          onClick={() => setActiveDeck('courses')}
        >
          <IconSubjects size={16} />
          <span>Course Matrix ({enrolledSubjects.length})</span>
        </button>

        <button
          type="button"
          className={`deck-tab-btn ${activeDeck === 'forecaster' ? 'active' : ''}`}
          onClick={() => setActiveDeck('forecaster')}
        >
          <IconSparkles size={16} />
          <span>Target Forecaster & Leave Advisor</span>
        </button>

        <button
          type="button"
          className={`deck-tab-btn ${activeDeck === 'admitpass' ? 'active' : ''}`}
          onClick={() => setActiveDeck('admitpass')}
        >
          <IconShieldCheck size={16} />
          <span>Exam Clearance Pass</span>
        </button>

        <button
          type="button"
          className={`deck-tab-btn ${activeDeck === 'ledger' ? 'active' : ''}`}
          onClick={() => setActiveDeck('ledger')}
        >
          <IconAttendance size={16} />
          <span>Recent Activity ({records.length})</span>
        </button>
      </div>

      {/* ====================================================================
          DECK 1: TODAY'S ROUTINE FLIGHT-DECK (Tactile 1-Click Check-In)
          ==================================================================== */}
      {activeDeck === 'routine' && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <p className="eyebrow">DAILY TIMETABLE STREAM</p>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-main)', margin: '0.2rem 0 0 0' }}>
                Today's Lecture Routine
              </h2>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Marking attendance here saves directly to your permanent Attendance ledger.
              </span>
            </div>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleMarkAllPresent}
              title="Quickly record all conducted classes as Present"
            >
              ⚡ 1-Click Mark All Conducted as Present
            </button>
          </div>

          <div className="timetable-list">
            {todayClasses.map((slot) => {
              const isConducted = slot.crStatus === 'conducted';
              const isCancelled = slot.crStatus === 'cancelled';

              return (
                <div key={slot.id} className="timetable-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
                    <div style={{ minWidth: '115px' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: 'var(--text-subtle)', display: 'block' }}>
                        {slot.time}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--brand-600)' }}>
                          {slot.slotName}
                        </span>
                        {isConducted && (
                          <span className="badge badge-success" style={{ fontSize: '0.62rem', padding: '0.1rem 0.35rem' }}>Held</span>
                        )}
                        {isCancelled && (
                          <span className="badge badge-warning" style={{ fontSize: '0.62rem', padding: '0.1rem 0.35rem' }}>Cancelled</span>
                        )}
                        {!isConducted && !isCancelled && (
                          <span className="badge badge-info" style={{ fontSize: '0.62rem', padding: '0.1rem 0.35rem' }}>Scheduled</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span className="course-code-pill" style={{ padding: '0.1rem 0.45rem' }}>
                          {slot.code}
                        </span>
                        <strong style={{ fontSize: '0.98rem', color: 'var(--text-main)' }}>
                          {slot.name}
                        </strong>
                      </div>
                      <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.2rem' }}>
                        {slot.room} {slot.crNote ? `• CR Note: "${slot.crNote}"` : ''}
                      </span>
                    </div>
                  </div>

                  <div>
                    {!isCancelled ? (
                      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                        <button
                          type="button"
                          className={`punch-pill-btn ${slot.studentStatus === 'present' ? 'active-present' : ''}`}
                          onClick={() => handlePunchClass(slot.id, 'present')}
                          title="Mark as Present"
                        >
                          ✓ Present
                        </button>
                        <button
                          type="button"
                          className={`punch-pill-btn ${slot.studentStatus === 'absent' ? 'active-absent' : ''}`}
                          onClick={() => handlePunchClass(slot.id, 'absent')}
                          title="Mark as Absent"
                        >
                          ✗ Absent
                        </button>
                        <button
                          type="button"
                          className={`punch-pill-btn ${slot.studentStatus === 'od' ? 'active-od' : ''}`}
                          onClick={() => handlePunchClass(slot.id, 'od')}
                          title="On Duty (Authorized Leave)"
                        >
                          OD
                        </button>
                      </div>
                    ) : (
                      <span className="badge badge-warning" style={{ fontSize: '0.72rem' }}>
                        Lecture Not Conducted
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ====================================================================
          DECK 2: COURSE MATRIX & TARGETS
          ==================================================================== */}
      {activeDeck === 'courses' && (
        <section>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <p className="eyebrow">SEMESTER 3 ENROLLED COURSES</p>
              <h2 style={{ fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--text-main)', margin: '0.2rem 0 0 0' }}>
                Course Attendance Breakdown
              </h2>
            </div>

            {onNavigateToSubjects && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onNavigateToSubjects}
              >
                <IconSubjects size={14} />
                <span>Manage Enrolled Courses</span>
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.25rem' }}>
            {subjectStats.map((sub) => {
              const isEligible = sub.hasSessions ? sub.percentage >= 75 : true;

              return (
                <div
                  key={sub.code}
                  className="surface"
                  style={{
                    padding: '1.25rem',
                    borderRadius: 'var(--radius-xl)',
                    border: '1px solid var(--border-card)',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                      <span className="course-code-pill">{sub.code}</span>
                      <span
                        className={`badge ${sub.hasSessions ? (isEligible ? 'badge-success' : 'badge-danger') : 'badge-info'}`}
                        style={{ fontSize: '0.68rem' }}
                      >
                        {sub.hasSessions ? (isEligible ? 'Eligible' : 'Shortage') : 'No classes yet'}
                      </span>
                    </div>

                    <h3 style={{ fontSize: '0.98rem', fontWeight: 700, color: 'var(--text-main)', margin: '0 0 0.5rem 0' }}>
                      {sub.name}
                    </h3>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: '1rem', marginBottom: '0.4rem' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        Attended: <strong>{sub.attended}</strong> / {sub.total}
                      </span>
                      <strong style={{ fontSize: '1.2rem', fontFamily: 'var(--font-mono)', color: sub.hasSessions ? (isEligible ? 'var(--status-success)' : 'var(--status-danger)') : 'var(--text-main)' }}>
                        {sub.hasSessions ? `${sub.percentage}%` : '--%'}
                      </strong>
                    </div>

                    {/* Thin Horizon Bar with 75% Pin */}
                    <div style={{ position: 'relative', width: '100%', height: '6px', background: 'var(--bg-card-subtle)', borderRadius: '999px', overflow: 'hidden' }}>
                      <div
                        style={{
                          height: '100%',
                          width: `${Math.min(100, sub.percentage)}%`,
                          background: isEligible ? 'var(--status-success)' : 'var(--status-danger)',
                          borderRadius: '999px',
                          transition: 'width 0.4s ease',
                        }}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-card)', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {sub.hasSessions ? (
                      sub.missBudget > 0 ? (
                        <span style={{ color: 'var(--status-success)', fontWeight: 600 }}>
                          ✓ Can safely miss up to {sub.missBudget} classes
                        </span>
                      ) : sub.recoveryCount > 0 ? (
                        <span style={{ color: 'var(--status-danger)', fontWeight: 600 }}>
                          ⚠️ Need +{sub.recoveryCount} classes to reach 75%
                        </span>
                      ) : (
                        <span>Right on 75% boundary</span>
                      )
                    ) : (
                      <span>No recorded attendance yet</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ====================================================================
          DECK 3: TARGET FORECASTER & LEAVE ADVISOR
          ==================================================================== */}
      {activeDeck === 'forecaster' && (
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          
          {/* Card A: Target Forecaster */}
          <div className="surface" style={{ padding: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
              <div>
                <p className="eyebrow">TRAJECTORY ENGINE</p>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', margin: '0.2rem 0 0 0' }}>
                  Target Threshold & Classes Needed Forecaster
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Toggle target percentages to see the exact number of classes you need to attend or can safely miss.
                </span>
              </div>

              {/* Target Pills */}
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                {[
                  { val: 75, label: '75% Pass' },
                  { val: 80, label: '80% Safe' },
                  { val: 85, label: '85% Distinction' },
                  { val: 90, label: '90% Merit' },
                ].map((p) => (
                  <button
                    key={p.val}
                    type="button"
                    className={`btn ${targetGoal === p.val ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ fontSize: '0.78rem', padding: '0.4rem 0.85rem' }}
                    onClick={() => setTargetGoal(p.val)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Dynamic Result Card */}
            {metrics.hasData ? (
              (metrics.rate || 0) < targetGoal ? (
                <div style={{ padding: '1.25rem', borderRadius: 'var(--radius-lg)', background: 'var(--status-danger-bg)', border: '1px solid var(--status-danger-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--status-danger)', textTransform: 'uppercase' }}>
                      ⚠️ DEFICIT FOR {targetGoal}% GOAL
                    </span>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.25rem' }}>
                      You need to attend <span style={{ color: 'var(--status-danger)', textDecoration: 'underline' }}>{metrics.atSelected.needed} more consecutive classes</span> without missing.
                    </div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
                      Attending the next {metrics.atSelected.needed} lectures consecutively will bring your rate from {metrics.rate}% to {targetGoal}%, restoring your exam eligibility.
                    </span>
                  </div>
                  <div style={{ fontSize: '2.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--status-danger)' }}>
                    +{metrics.atSelected.needed}
                  </div>
                </div>
              ) : (
                <div style={{ padding: '1.25rem', borderRadius: 'var(--radius-lg)', background: 'var(--status-success-bg)', border: '1px solid var(--status-success-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--status-success)', textTransform: 'uppercase' }}>
                      ✓ TARGET ACHIEVED ({targetGoal}%)
                    </span>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', marginTop: '0.25rem' }}>
                      You can safely take up to <span style={{ color: 'var(--status-success)', textDecoration: 'underline' }}>{metrics.atSelected.margin} permissible leaves</span>.
                    </div>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'block', marginTop: '0.25rem' }}>
                      Current rate is {metrics.rate}%. {targetGoal < 85 ? `To step up to 85% Distinction, you need +${metrics.at85.needed} more classes.` : 'You are in the highest compliance tier.'}
                    </span>
                  </div>
                  <div style={{ fontSize: '2.25rem', fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--status-success)' }}>
                    +{metrics.atSelected.margin}
                  </div>
                </div>
              )
            ) : (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No attendance records yet. Log your first class in <strong>Today's Routine</strong> to activate the Trajectory Engine.
              </div>
            )}
          </div>

          {/* Card B: Smart Absence Simulator */}
          <div className="surface" style={{ padding: '1.75rem' }}>
            <p className="eyebrow">WHAT-IF ABSENCE SIMULATOR</p>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', margin: '0.2rem 0 1rem 0' }}>
              Simulate Planned Leaves Before Missing Class
            </h3>

            {metrics.hasData ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Simulate missing next:</span>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    {[1, 2, 3, 4, 5].map((count) => (
                      <button
                        key={count}
                        type="button"
                        className={`btn ${simulatedMisses === count ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ padding: '0.3rem 0.75rem', fontSize: '0.8rem' }}
                        onClick={() => setSimulatedMisses(count)}
                      >
                        {count} {count === 1 ? 'class' : 'classes'}
                      </button>
                    ))}
                  </div>
                </div>

                {(() => {
                  const projectedTotal = metrics.total + simulatedMisses;
                  const projectedRate = Math.round((metrics.attended / projectedTotal) * 100);
                  const isSafe = projectedRate >= 75;

                  return (
                    <div style={{ padding: '1.2rem', borderRadius: 'var(--radius-lg)', background: isSafe ? 'var(--status-success-bg)' : 'var(--status-danger-bg)', border: `1px solid ${isSafe ? 'var(--status-success-border)' : 'var(--status-danger-border)'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ fontSize: '0.98rem', color: 'var(--text-main)' }}>
                            Projected Attendance: {projectedRate}% (from {metrics.rate}%)
                          </strong>
                          <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                            {isSafe
                              ? `✓ Safe: Missing ${simulatedMisses} ${simulatedMisses === 1 ? 'class' : 'classes'} keeps you above the 75% examination threshold.`
                              : `⚠️ Danger: Missing ${simulatedMisses} ${simulatedMisses === 1 ? 'class' : 'classes'} will drop your attendance to ${projectedRate}%, causing exam debarment.`}
                          </span>
                        </div>
                        <span className={`badge ${isSafe ? 'badge-success' : 'badge-danger'}`}>
                          {isSafe ? 'PERMISSIBLE' : 'NOT RECOMMENDED'}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Simulator requires at least 1 recorded lecture.
              </span>
            )}
          </div>
        </section>
      )}

      {/* ====================================================================
          DECK 4: DIGITAL ADMIT PASS & NOTICES (Official Academic Clearance)
          ==================================================================== */}
      {activeDeck === 'admitpass' && (
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', alignItems: 'start' }}>
          
          {/* Admit Pass */}
          <div className="surface" style={{ padding: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <p className="eyebrow">DHEMAJI ENGINEERING COLLEGE</p>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', margin: '0.2rem 0 0 0' }}>
                  Semester Examination Clearance Pass
                </h3>
              </div>

              <span className={`badge ${metrics.isCompliant ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: '0.75rem', padding: '0.3rem 0.65rem' }}>
                {metrics.isCompliant ? '✓ CLEARED' : '⚠ SHORTAGE'}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '1rem', background: 'var(--bg-card-subtle)', borderRadius: 'var(--radius-lg)', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Student Name:</span>
                <strong style={{ color: 'var(--text-main)' }}>{userName}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Department:</span>
                <span style={{ color: 'var(--text-main)', fontWeight: 600 }}>Computer Science & Engineering</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Academic Term:</span>
                <span style={{ color: 'var(--text-main)' }}>Semester 3 (2026–2027)</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Admit Card Status:</span>
                <strong style={{ color: metrics.isCompliant ? 'var(--status-success)' : 'var(--status-danger)' }}>
                  {metrics.isCompliant ? 'Issued & Cleared for Finals' : 'On Hold (Shortage Deficit)'}
                </strong>
              </div>
            </div>

            <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', display: 'block', textAlign: 'center' }}>
              Officially validated against ASTU 75% attendance regulations.
            </span>
          </div>

          {/* Institutional Regulations Note */}
          <div className="surface" style={{ padding: '1.75rem' }}>
            <p className="eyebrow">EXAMINATION DIRECTIVE</p>
            <h4 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-main)', margin: '0.2rem 0 0.5rem 0' }}>
              ASTU Academic Attendance Rule 2026
            </h4>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
              Under Assam Science and Technology University (ASTU) norms, candidates with an aggregate attendance of less than <strong>75%</strong> in lecture, tutorial, and laboratory sessions are not permitted to appear in the end-semester examinations without official condonation on medical or sanctioned On-Duty (OD) grounds.
            </p>
          </div>
        </section>
      )}

      {/* ====================================================================
          DECK 5: RECENT ATTENDANCE LEDGER
          ==================================================================== */}
      {activeDeck === 'ledger' && (
        <section className="surface" style={{ padding: '1.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div>
              <p className="eyebrow">AUDIT RECORD</p>
              <h3 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-main)', margin: '0.2rem 0 0 0' }}>
                Recent Attendance Sessions
              </h3>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Real-time verified log of all classes you've marked.
              </span>
            </div>

            {onNavigateToAttendance && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onNavigateToAttendance}
              >
                <IconAttendance size={14} />
                <span>Open Full Ledger</span>
              </button>
            )}
          </div>

          {records.length === 0 ? (
            <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No attendance records logged yet. Check in to today's classes in <strong>Today's Routine</strong> to see them here!
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Course</th>
                    <th>Status</th>
                    <th>Type</th>
                  </tr>
                </thead>
                <tbody>
                  {records.slice(0, 10).map((r) => (
                    <tr key={r.id}>
                      <td>
                        <strong style={{ fontSize: '0.84rem' }}>{r.sessionDate}</strong>
                      </td>
                      <td>
                        <strong style={{ display: 'block', fontSize: '0.84rem' }}>{r.subjectName}</strong>
                        <span style={{ fontSize: '0.72rem', color: 'var(--brand-600)', fontFamily: 'var(--font-mono)' }}>
                          {r.subjectCode}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            r.status === 'present'
                              ? 'badge-success'
                              : r.status === 'od'
                              ? 'badge-info'
                              : 'badge-danger'
                          }`}
                        >
                          {r.status === 'present'
                            ? 'Present'
                            : r.status === 'od'
                            ? 'On Duty'
                            : 'Absent'}
                        </span>
                      </td>
                      <td style={{ textTransform: 'capitalize', fontSize: '0.8rem' }}>
                        {r.classType}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

    </div>
  );
};
