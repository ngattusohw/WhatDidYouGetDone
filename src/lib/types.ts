export interface User {
  id: string;
  email: string;
  full_name: string | null;
  subscription_tier: 'free' | 'premium';
  notification_email: boolean;
  notification_phone: boolean;
  phone: string | null;
}

export interface Integration {
  id: string;
  type: string;
  name: string;
  description: string;
  is_premium: boolean;
}

export interface UserIntegration {
  id: string;
  user_id: string;
  integration_id: string;
  is_active: boolean;
}

export interface Team {
  id: string;
  name: string;
  created_by: string;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  role: string;
}

export interface ProductivityStats {
  id: string;
  user_id: string;
  integration_id: string;
  week_start: string;
  stats: Record<string, any>;
  summary: string | null;
}