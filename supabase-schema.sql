-- Create team_members table
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create weeks table
CREATE TABLE public.weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start_date DATE NOT NULL UNIQUE,
  week_end_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create tasks table
CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  week_id UUID NOT NULL REFERENCES public.weeks(id) ON DELETE CASCADE,
  heading VARCHAR(255) NOT NULL,
  task_name VARCHAR(255) NOT NULL,
  deadline DATE,
  completed_date DATE,
  estimated_hours DECIMAL(5,2),
  status VARCHAR(50) DEFAULT 'pending',
  on_hold_reason TEXT,
  carry_forward_weeks INT DEFAULT 0,
  parent_task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  position INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for common queries
CREATE INDEX idx_tasks_team_member_id ON public.tasks(team_member_id);
CREATE INDEX idx_tasks_week_id ON public.tasks(week_id);
CREATE INDEX idx_tasks_parent_task_id ON public.tasks(parent_task_id);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_weeks_start_date ON public.weeks(week_start_date);

-- Insert current week
INSERT INTO public.weeks (week_start_date, week_end_date)
VALUES ('2026-06-22', '2026-06-28')
ON CONFLICT DO NOTHING;

-- Sample team members
INSERT INTO public.team_members (name, email)
VALUES 
  ('John Doe', 'john@company.com'),
  ('Jane Smith', 'jane@company.com'),
  ('Mike Johnson', 'mike@company.com')
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable read access for all users" ON public.team_members
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON public.weeks
  FOR SELECT USING (true);

CREATE POLICY "Enable read access for all users" ON public.tasks
  FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users" ON public.tasks
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable update for authenticated users" ON public.tasks
  FOR UPDATE USING (true);

CREATE POLICY "Enable delete for authenticated users" ON public.tasks
  FOR DELETE USING (true);
