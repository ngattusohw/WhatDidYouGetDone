import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Github, LineChart, Timer, Users2 } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="text-xl font-bold">WhatDidYouGetDone</div>
          <div className="space-x-4">
            <Button variant="ghost" asChild>
              <Link to="/login">Login</Link>
            </Button>
            <Button asChild>
              <Link to="/register">Get Started</Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-24 text-center">
        <h1 className="text-5xl font-bold tracking-tight">
          "What did you get done this week?"
        </h1>
        <p className="mt-6 text-xl text-muted-foreground max-w-2xl mx-auto">
          Track your productivity, celebrate your wins, and never struggle to remember your accomplishments again.
        </p>
        <div className="mt-10">
          <Button size="lg" asChild>
            <Link to="/register">Start Tracking Free</Link>
          </Button>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-24">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="p-6 border rounded-lg">
            <Github className="h-12 w-12 mb-4" />
            <h3 className="text-xl font-semibold mb-2">GitHub Integration</h3>
            <p className="text-muted-foreground">
              Automatically track your code contributions and generate smart summaries of your work.
            </p>
          </div>
          <div className="p-6 border rounded-lg">
            <Timer className="h-12 w-12 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Pomodoro Timer</h3>
            <p className="text-muted-foreground">
              Stay focused with built-in time tracking and productivity metrics.
            </p>
          </div>
          <div className="p-6 border rounded-lg">
            <LineChart className="h-12 w-12 mb-4" />
            <h3 className="text-xl font-semibold mb-2">Weekly Insights</h3>
            <p className="text-muted-foreground">
              Get AI-powered summaries and visualizations of your productivity patterns.
            </p>
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="bg-muted py-24">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-12">Join thousands of productive professionals</h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="p-6 bg-background rounded-lg">
              <p className="italic mb-4">
                "Finally, a tool that helps me remember and showcase my weekly accomplishments!"
              </p>
              <p className="font-semibold">Sarah Chen</p>
              <p className="text-sm text-muted-foreground">Software Engineer</p>
            </div>
            <div className="p-6 bg-background rounded-lg">
              <p className="italic mb-4">
                "The GitHub integration and AI summaries save me hours of weekly reporting time."
              </p>
              <p className="font-semibold">Marcus Johnson</p>
              <p className="text-sm text-muted-foreground">Tech Lead</p>
            </div>
            <div className="p-6 bg-background rounded-lg">
              <p className="italic mb-4">
                "Perfect for tracking both individual and team productivity metrics."
              </p>
              <p className="font-semibold">Lisa Rodriguez</p>
              <p className="text-sm text-muted-foreground">Engineering Manager</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-24 text-center">
        <h2 className="text-3xl font-bold mb-6">
          Start tracking your productivity today
        </h2>
        <p className="text-xl text-muted-foreground mb-8">
          Join thousands of professionals who never miss a win.
        </p>
        <Button size="lg" asChild>
          <Link to="/register">Get Started Free</Link>
        </Button>
      </section>
    </div>
  );
}