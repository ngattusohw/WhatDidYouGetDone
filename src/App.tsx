import { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { supabase } from '@/lib/supabase';
import { AuthProvider } from '@/contexts/AuthContext';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Integrations from '@/pages/Integrations';
// import Teams from '@/pages/Teams';
import Settings from '@/pages/Settings';

function App() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.onAuthStateChange(() => {
      setIsLoading(false);
    });
  }, []);

  if (isLoading) {
    return null;
  }

  return (
    // <ThemeProvider defaultTheme="dark" storageKey="ui-theme">
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="integrations" element={<Integrations />} />
            {/* <Route path="teams" element={<Teams />} /> */}
            {/* <Route path="settings" element={<Settings />} /> */}
          </Route>
        </Routes>
        <Toaster />
      </AuthProvider>
    </Router>
    // </ThemeProvider>
  );
}

export default App;
