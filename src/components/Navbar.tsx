import { Link } from 'react-router-dom';
import { Activity, Settings, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import ThemeToggle from '@/components/ThemeToggle';

export default function Navbar() {
  const { signOut } = useAuth();

  return (
    <nav className="border-b">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center space-x-8">
            <Link to="/" className="text-xl font-bold">
              WhatDidYouGetDone?
            </Link>
            <div className="flex space-x-4">
              <Link
                to="/dashboard"
                className="flex items-center space-x-2 text-muted-foreground hover:text-foreground"
              >
                <Activity size={20} />
                <span>Dashboard</span>
              </Link>
              <Link
                to="/teams"
                className="flex items-center space-x-2 text-muted-foreground hover:text-foreground"
              >
                <Users size={20} />
                <span>Teams</span>
              </Link>
              <Link
                to="/settings"
                className="flex items-center space-x-2 text-muted-foreground hover:text-foreground"
              >
                <Settings size={20} />
                <span>Settings</span>
              </Link>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <ThemeToggle />
            <Button variant="ghost" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
