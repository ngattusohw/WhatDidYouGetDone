import { Link } from 'react-router-dom';
import { Activity, Settings, Plug, GitFork } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';

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
                to="/app/dashboard"
                className="flex items-center space-x-2 text-muted-foreground hover:text-foreground"
              >
                <Activity className="h-5 w-5" />
                <span>Dashboard</span>
              </Link>
              <Link
                to="/app/integrations"
                className="flex items-center space-x-2 text-muted-foreground hover:text-foreground"
              >
                <Plug className="h-5 w-5" />
                <span>Integrations</span>
              </Link>
              <Link
                to="/app/repositories"
                className="flex items-center space-x-2 text-muted-foreground hover:text-foreground"
              >
                <GitFork className="h-5 w-5" />
                <span>Repositories</span>
              </Link>
              <Link
                to="/app/settings"
                className="flex items-center space-x-2 text-muted-foreground hover:text-foreground"
              >
                <Settings className="h-5 w-5" />
                <span>Settings</span>
              </Link>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <Button variant="ghost" onClick={signOut}>
              <span className="text-white">Sign out</span>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}
