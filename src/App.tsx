import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { Attendance } from './components/Attendance';
import { Subjects } from './components/Subjects';
import { Settings } from './components/Settings';
import { CRPortal } from './components/CRPortal';
import {
  IconDashboard,
  IconAttendance,
  IconSubjects,
  IconCRPortal,
  IconSettings,
  IconSun,
  IconMoon,
  IconLogOut,
} from './components/Icons';
import './App.css';

export type Page = 'Dashboard' | 'Attendance' | 'Subjects' | 'CR Updates' | 'Settings';

interface ProfileState {
  fullName: string;
  department: string;
  role: 'student' | 'cr' | 'admin';
  rollNumber?: string;
}

interface NavItemConfig {
  page: Page;
  label: string;
  icon: React.ReactNode;
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [activePage, setActivePage] = useState<Page>('Dashboard');
  const [darkMode, setDarkMode] = useState(false);
  const [profile, setProfile] = useState<ProfileState>({
    fullName: '',
    department: 'CSE Department',
    role: 'student',
  });

  const loadUserProfile = async (userId: string, email?: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, department, role, roll_number')
        .eq('id', userId)
        .single();

      if (data && data.full_name) {
        setProfile({
          fullName: data.full_name,
          department: data.department || 'Computer Science & Engineering',
          role: data.role || 'student',
          rollNumber: data.roll_number || '',
        });
      } else {
        setProfile({
          fullName: email ? email.split('@')[0] : 'Student',
          department: 'Computer Science & Engineering',
          role: 'student',
        });
      }
    } catch {
      setProfile({
        fullName: email ? email.split('@')[0] : 'Student',
        department: 'Computer Science & Engineering',
        role: 'student',
      });
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        loadUserProfile(session.user.id, session.user.email);
      }
      setLoadingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
      }
      setSession(session);
      if (session) {
        loadUserProfile(session.user.id, session.user.email);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute(
      'data-theme',
      darkMode ? 'dark' : 'light'
    );
  }, [darkMode]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  if (loadingSession) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-app)',
          color: 'var(--text-muted)',
          fontSize: '0.9rem',
          fontWeight: 600,
        }}
      >
        Loading AttendIQ Portal...
      </div>
    );
  }

  if (isPasswordRecovery) {
    return (
      <Auth
        initialMode="reset"
        onAuthSuccess={() => setIsPasswordRecovery(false)}
      />
    );
  }

  if (!session) {
    return <Auth onAuthSuccess={() => {}} />;
  }

  const navItems: NavItemConfig[] = [
    {
      page: 'Dashboard',
      label: 'Dashboard',
      icon: <IconDashboard size={16} />,
    },
    {
      page: 'Attendance',
      label: 'Attendance',
      icon: <IconAttendance size={16} />,
    },
    {
      page: 'Subjects',
      label: 'Subjects',
      icon: <IconSubjects size={16} />,
    },
  ];

  if (profile.role === 'cr' || profile.role === 'admin') {
    navItems.push({
      page: 'CR Updates',
      label: 'CR Updates',
      icon: <IconCRPortal size={16} />,
    });
  }

  navItems.push({
    page: 'Settings',
    label: 'Settings',
    icon: <IconSettings size={16} />,
  });

  return (
    <div className="app-wrapper">
      {/* Clean Minimalist Top Institutional Header */}
      <header className="top-navbar">
        <div className="navbar-container">
          {/* Brand */}
          <div className="nav-brand" onClick={() => setActivePage('Dashboard')}>
            <div className="nav-brand-logo">A</div>
            <div className="nav-brand-info">
              <h2>AttendIQ</h2>
              <span className="nav-brand-sub">
                Dhemaji Engineering College • {profile.role === 'cr' ? 'Class Representative' : 'Student Portal'}
              </span>
            </div>
          </div>

          {/* Right Header Status & Profile Controls */}
          <div className="nav-actions">
            <span className="badge-pill" style={{ display: 'none' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--status-success)' }} />
              CSE 3rd Sem
            </span>

            <button
              type="button"
              className="theme-pill-btn"
              onClick={() => setDarkMode((prev) => !prev)}
              title="Toggle Light / Dark mode"
            >
              {darkMode ? <IconSun size={14} /> : <IconMoon size={14} />}
            </button>

            {/* User Capsule */}
            <div className="user-capsule" title={`${profile.fullName} (${profile.department})`}>
              <div className="user-capsule-avatar">
                {profile.fullName.charAt(0).toUpperCase() || 'S'}
              </div>
              <span className="user-capsule-name">
                {profile.fullName.split(' ')[0] || 'Student'}
              </span>
            </div>

            <button
              type="button"
              className="signout-header-btn"
              onClick={handleSignOut}
              title="Sign Out"
            >
              <IconLogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      {/* Main Page Container */}
      <main className="page-container">
        {activePage === 'Dashboard' && (
          <Dashboard
            session={session}
            onNavigateToAttendance={() => setActivePage('Attendance')}
            onNavigateToSubjects={() => setActivePage('Subjects')}
            onNavigateToCR={() => setActivePage('CR Updates')}
            userRole={profile.role}
            userName={profile.fullName}
          />
        )}

        {activePage === 'Attendance' && (
          <Attendance session={session} />
        )}

        {activePage === 'Subjects' && (
          <Subjects session={session} />
        )}

        {activePage === 'CR Updates' && (
          <CRPortal session={session} />
        )}

        {activePage === 'Settings' && (
          <Settings
            session={session}
            onProfileUpdated={() => loadUserProfile(session.user.id, session.user.email)}
          />
        )}
      </main>

      {/* Signature Floating Dynamic Bottom Dock */}
      <nav className="floating-bottom-dock" role="navigation" aria-label="Main Navigation">
        {navItems.map((item) => {
          const isActive = activePage === item.page;
          return (
            <button
              key={item.page}
              type="button"
              className={`dock-item ${isActive ? 'active' : ''}`}
              onClick={() => setActivePage(item.page)}
            >
              <span className="dock-item-icon">{item.icon}</span>
              <span className="dock-item-label">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

export default App;
