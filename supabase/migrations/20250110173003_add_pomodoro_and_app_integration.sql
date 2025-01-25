-- Add new integration type to enum
ALTER TYPE integration_type ADD VALUE IF NOT EXISTS 'what_did_you_get_done_app';

-- Create pomodoro_sessions table
CREATE TABLE IF NOT EXISTS pomodoro_sessions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    start_time timestamptz NOT NULL,
    end_time timestamptz NOT NULL,
    duration_minutes integer NOT NULL,
    status text NOT NULL CHECK (status IN ('completed', 'interrupted')),
    distraction_count integer DEFAULT 0,
    notes text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- Enable RLS for pomodoro_sessions
ALTER TABLE pomodoro_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies for pomodoro_sessions
CREATE POLICY "Users can read their own pomodoro sessions"
    ON pomodoro_sessions FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own pomodoro sessions"
    ON pomodoro_sessions FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);