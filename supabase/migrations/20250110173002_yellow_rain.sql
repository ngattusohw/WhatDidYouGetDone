/*
  # Initial Schema Setup for WhatDidYouGetDone

  1. New Tables
    - `users`
      - Extended user profile data
    - `integrations`
      - Stores available integration types
    - `user_integrations`
      - Links users to their active integrations
    - `teams`
      - Team information
    - `team_members`
      - Team membership
    - `productivity_stats`
      - Weekly productivity statistics
    - `integration_tokens`
      - Secure storage for integration access tokens

  2. Security
    - Enable RLS on all tables
    - Add policies for secure data access
*/

-- Create custom types
CREATE TYPE integration_type AS ENUM (
  'github',
  'twitter',
  'notion',
  'google_drive',
  'gmail',
  'jira',
  'gitlab',
  'trello',
  'slack'
);

CREATE TYPE subscription_tier AS ENUM (
  'free',
  'premium'
);

-- Create tables
CREATE TABLE IF NOT EXISTS users (
  id uuid REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email text UNIQUE NOT NULL,
  full_name text,
  subscription_tier subscription_tier DEFAULT 'free',
  notification_email boolean DEFAULT false,
  notification_phone boolean DEFAULT false,
  phone text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type integration_type NOT NULL,
  name text NOT NULL,
  description text,
  is_premium boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES integrations(id) ON DELETE CASCADE,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, integration_id)
);

CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid REFERENCES users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  role text DEFAULT 'member',
  created_at timestamptz DEFAULT now(),
  UNIQUE(team_id, user_id)
);

CREATE TABLE IF NOT EXISTS productivity_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES integrations(id),
  week_start date NOT NULL,
  stats jsonb NOT NULL,
  summary text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, integration_id, week_start)
);

CREATE TABLE IF NOT EXISTS integration_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  integration_id uuid REFERENCES integrations(id),
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, integration_id)
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE productivity_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_tokens ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can read their own data"
  ON users FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own data"
  ON users FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Anyone can read integrations"
  ON integrations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can read their integrations"
  ON user_integrations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their integrations"
  ON user_integrations FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Team members can read team data"
  ON teams FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members
      WHERE team_members.team_id = id
      AND team_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Team members can read membership"
  ON team_members FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = team_id
      AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can read their stats"
  ON productivity_stats FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id OR
    EXISTS (
      SELECT 1 FROM team_members tm
      JOIN team_members viewer_tm ON tm.team_id = viewer_tm.team_id
      WHERE tm.user_id = productivity_stats.user_id
      AND viewer_tm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can read their tokens"
  ON integration_tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their tokens"
  ON integration_tokens FOR ALL
  TO authenticated
  USING (auth.uid() = user_id);

-- Insert default integrations
INSERT INTO integrations (type, name, description, is_premium) VALUES
  ('github', 'GitHub', 'Track your GitHub activity and contributions', false),
  ('twitter', 'Twitter/X', 'Monitor your Twitter/X engagement', true),
  ('notion', 'Notion', 'Track your Notion activity and documents', true),
  ('google_drive', 'Google Drive', 'Monitor your Google Drive activity', true),
  ('gmail', 'Gmail', 'Track your email productivity', true),
  ('jira', 'Jira', 'Monitor your Jira tickets and activity', true),
  ('gitlab', 'GitLab', 'Track your GitLab activity and contributions', true),
  ('trello', 'Trello', 'Monitor your Trello board activity', true),
  ('slack', 'Slack', 'Track your Slack engagement and activity', true);

-- Create functions
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO users (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create triggers
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();