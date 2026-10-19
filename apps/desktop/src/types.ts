export type RecordValue<T> = { revision: number; value: T };
export type Profile = {
  timezone: string;
  daily_budget_minutes: number;
  interests: string[];
  background: string;
};
export type Track = {
  goal_id?: string;
  module_sequence?: string[];
  module_index?: number;
  id: string;
  title: string;
  outcome: string;
  module: string;
  minutes: number;
  status: string;
  completion_criterion: string;
};
export type Block = {
  resource_ids?: string[];
  id: string;
  track_id: string;
  objective: string;
  minutes: number;
  completion_criterion: string;
  locked: boolean;
  completed: boolean;
};
export type Plan = {
  date: string;
  timezone: string;
  budget: number;
  blocks: Block[];
};
export type Note = {
  schema_version?: number;
  created_at?: string;
  kind?: string;
  session_id?: string | null;
  local_date?: string | null;
  energy?: number | null;
  difficulty?: number | null;
  id: string;
  title: string;
  body: string;
  tags: string[];
  track_id: string | null;
  revision: number;
  updated_at: string;
};
export type Memory = {
  id: string;
  statement: string;
  status: string;
  source_id: string;
  source_revision: number;
};
export type Resource = {
  id: string;
  title: string;
  url: string;
  kind: string;
  provenance: string;
};
export type Settings = {
  provider: string;
  endpoint: string;
  chat_model: string;
  embedding_model: string;
  context_tokens: number;
};
export type Session = {
  id: string;
  block_id: string;
  plan_date: string;
  started_at: string;
  active_seconds: number;
  status: string;
  outcome: string;
  last_tick: string;
};
export type IndexStatus = {
  id: string;
  identity: {
    model_name: string;
    model_fingerprint: string | null;
    dimensions: number;
  };
  status: string;
  done: number;
  total: number;
  failed: number;
};
export type Snapshot = {
  profile: RecordValue<Profile>;
  tracks: RecordValue<Track[]>;
  settings: RecordValue<Settings>;
  plan: RecordValue<Plan>;
  notes: Note[];
  memories: RecordValue<Memory>[];
  resources: RecordValue<Resource>[];
  session: RecordValue<Session> | null;
  indexes: IndexStatus[];
  vault: string;
  today: string;
};
export type Proposal = {
  id: string;
  plan: Plan;
  base_revision: number;
  repaired: boolean;
};
export type Hit = {
  id: string;
  title: string;
  excerpt: string;
  revision: number;
  score: number;
};
