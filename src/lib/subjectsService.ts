import { supabase } from './supabase';

export interface EnrolledSubject {
  id: string;
  student_id: string;
  semester_id?: string;
  subject_name: string;
  subject_code: string;
  schedule_days: number[];
}

export const DEFAULT_CSE_SUBJECTS = [
  {
    code: 'CS302',
    name: 'Object Oriented Programming',
    days: [1, 2, 3, 4, 5],
    time: '09:00 - 10:00 AM',
    slot: 'Period 1',
    room: 'Room 204',
  },
  {
    code: 'CS301',
    name: 'Data Structures & Algorithms',
    days: [1, 2, 3, 4, 5],
    time: '10:00 - 11:00 AM',
    slot: 'Period 2',
    room: 'Room 204',
  },
  {
    code: 'CS304',
    name: 'Discrete Mathematics',
    days: [1, 2, 3, 4, 5],
    time: '11:15 - 12:15 PM',
    slot: 'Period 3',
    room: 'Room 204',
  },
  {
    code: 'CS303',
    name: 'Digital Logic & Computer Design',
    days: [1, 2, 3, 4, 5],
    time: '12:15 - 01:15 PM',
    slot: 'Period 4',
    room: 'Room 204',
  },
  {
    code: 'CS306',
    name: 'Data Structures Laboratory',
    days: [1, 3, 5],
    time: '01:30 - 03:30 PM',
    slot: 'Period 5 & 6',
    room: 'Software Lab 2',
  },
];

/**
 * Ensures a student has active semester and registered subjects in Supabase.
 * If none exist, seeds the standard Dhemaji Engineering College CSE Semester 3 curriculum.
 */
export async function ensureStudentSubjects(userId: string): Promise<EnrolledSubject[]> {
  try {
    // 1. Check existing subjects
    const { data: existing, error: fetchErr } = await supabase
      .from('subjects')
      .select('id, student_id, semester_id, subject_name, subject_code, schedule_days')
      .eq('student_id', userId)
      .order('subject_code', { ascending: true });

    if (!fetchErr && existing && existing.length > 0) {
      return existing.map((s: any) => ({
        ...s,
        schedule_days: s.schedule_days || [1, 2, 3, 4, 5],
      }));
    }

    // 2. Ensure active semester exists
    const { data: activeSems } = await supabase
      .from('semesters')
      .select('id')
      .eq('student_id', userId)
      .eq('status', 'active')
      .limit(1);

    let semesterId = activeSems?.[0]?.id;
    if (!semesterId) {
      const { data: newSem } = await supabase
        .from('semesters')
        .insert({
          student_id: userId,
          semester_number: 3,
          academic_year: '2026-2027',
          status: 'active',
        })
        .select('id')
        .single();
      semesterId = newSem?.id;
    }

    // 3. Seed standard curriculum
    const toInsert = DEFAULT_CSE_SUBJECTS.map((s) => ({
      student_id: userId,
      semester_id: semesterId,
      subject_code: s.code,
      subject_name: s.name,
      schedule_days: s.days,
    }));

    const { data: inserted, error: insertErr } = await supabase
      .from('subjects')
      .insert(toInsert)
      .select('id, student_id, semester_id, subject_name, subject_code, schedule_days');

    if (insertErr) {
      console.warn('Seed subjects warning:', insertErr.message);
      return [];
    }

    return (inserted || []).map((s: any) => ({
      ...s,
      schedule_days: s.schedule_days || [1, 2, 3, 4, 5],
    }));
  } catch (err) {
    console.warn('ensureStudentSubjects error:', err);
    return [];
  }
}
