import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { Attendance } from './components/Attendance';
import { Subjects } from './components/Subjects';
import { Settings } from './components/Settings';
import './App.css';

type Page = 'Dashboard' | 'Attendance' | 'Subjects' | 'Settings';

const navigation: Page[] = [
  'Dashboard',
  'Attendance',
  'Subjects',
  'Settings',
];

interface ProfileState {
  fullName: string;
  department: string;
}

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [activePage, setActivePage] = useState<Page>('Dashboard');
  const [darkMode, setDarkMode] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profile, setProfile] = useState<ProfileState>({
    fullName: '',
    department: 'CSE Department',
  });

  const loadUserProfile = async (userId: string, email?: string) => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, department')
        .eq('id', userId)
        .single();

      if (data && data.full_name) {
        setProfile({
          fullName: data.full_name,
          department: data.department || 'CSE Department',
        });
      } else {
        setProfile({
          fullName: email ? email.split('@')[0] : 'Student',
          department: 'CSE Department',
        });
      }
    } catch {
      setProfile({
        fullName: email ? email.split('@')[0] : 'Student',
        department: 'CSE Department',
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

  const handleNavClick = (page: Page) => {
    setActivePage(page);
    setMobileMenuOpen(false);
  };

  if (loadingSession) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0f172a',
          color: '#94a3b8',
        }}
      >
        Loading AttendIQ...
      </div>
    );
  }

  // If coming in from a password recovery link, display the reset password form
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

  return (
    <div className="app-shell">
      {/* Mobile Backdrop */}
      {mobileMenuOpen && (
        <div 
          className="mobile-backdrop" 
          onClick={() => setMobileMenuOpen(false)} 
        />
      )}

      {/* Sidebar Drawer */}
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div className="brand">
          <div className="brand-icon">A</div>
          <div>
            <h2>AttendIQ</h2>
            <span>DEC Edition</span>
          </div>
        </div>

        <div className="sidebar-label">WORKSPACE</div>

        <nav className="navigation">
          {navigation.map((page) => (
            <button
              key={page}
              className={`nav-item ${activePage === page ? 'active' : ''}`}
              onClick={() => handleNavClick(page)}
            >
              <span className="nav-dot" />
              {page}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="profile-avatar">
            {profile.fullName.charAt(0).toUpperCase() || 'S'}
          </div>
          <div className="profile-info">
            <strong>{profile.fullName}</strong>
            <span>{profile.department}</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        <header className="topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <button 
              className="mobile-menu-btn"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle navigation"
            >
              ☰
            </button>
            <div>
              <span className="breadcrumb">DEC / Student Portal</span>
              <h1>{activePage}</h1>
            </div>
          </div>

          <div className="topbar-actions">
            <button
              className="theme-toggle"
              onClick={() => setDarkMode((current) => !current)}
              aria-label="Toggle theme"
            >
              {darkMode ? '☀ Light mode' : '☾ Dark mode'}
            </button>
            <button
              onClick={handleSignOut}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: 'inherit',
                padding: '0.45rem 0.85rem',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              Sign Out
            </button>
          </div>
        </header>

        {activePage === 'Dashboard' && (
          <Dashboard
            session={session}
            onNavigateToAttendance={() => setActivePage('Attendance')}
          />
        )}

        {activePage === 'Attendance' && (
          <Attendance session={session} />
        )}

        {activePage === 'Subjects' && (
          <Subjects session={session} />
        )}

        {activePage === 'Settings' && (
          <Settings
            session={session}
            onProfileUpdated={() => loadUserProfile(session.user.id, session.user.email)}
          />
        )}
      </main>
    </div>
  );
}

export default App;
