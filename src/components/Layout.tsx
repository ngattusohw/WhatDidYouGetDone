import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/Navbar';
import { Loader2 } from 'lucide-react';

export default function Layout() {
  const { session, isLoading } = useAuth();

  if (!session && !isLoading) {
    return <Navigate to="/login" replace />;
  }

  return isLoading ? (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
    </div>
  ) : (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
}
