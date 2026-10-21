-- ============ USERS TABLE ============
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255),
  password_salt VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_email ON users(email);

-- ============ FAMILIES TABLE ============
CREATE TABLE families (
  id VARCHAR(32) PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  day VARCHAR(10) DEFAULT '',
  daily_bonus_xp INTEGER DEFAULT 30,
  daily_bonus_gold INTEGER DEFAULT 15,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_families_owner ON families(owner_id);
CREATE INDEX idx_families_name ON families(name);

-- ============ FAMILY MEMBERS TABLE ============
CREATE TABLE family_members (
  family_id VARCHAR(32) NOT NULL,
  user_id UUID NOT NULL,
  role VARCHAR(20) DEFAULT 'member',
  invited_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (family_id, user_id),
  CONSTRAINT fk_fm_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  CONSTRAINT fk_fm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============ CHILDREN TABLE ============
CREATE TABLE children (
  id VARCHAR(32) PRIMARY KEY,
  family_id VARCHAR(32) NOT NULL,
  name VARCHAR(255) NOT NULL,
  xp INTEGER DEFAULT 0,
  gold INTEGER DEFAULT 0,
  pin VARCHAR(4) DEFAULT '0000',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_child_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX idx_children_family ON children(family_id);
CREATE INDEX idx_children_id ON children(id);

-- ============ TASKS TABLE ============
CREATE TABLE tasks (
  id VARCHAR(32) PRIMARY KEY,
  child_id VARCHAR(32) NOT NULL,
  family_id VARCHAR(32) NOT NULL,
  icon VARCHAR(10),
  name VARCHAR(255) NOT NULL,
  xp INTEGER,
  gold INTEGER,
  done BOOLEAN DEFAULT FALSE,
  daily BOOLEAN DEFAULT FALSE,
  frequency VARCHAR(20),
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_task_child FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  CONSTRAINT fk_task_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX idx_tasks_child ON tasks(child_id);
CREATE INDEX idx_tasks_family ON tasks(family_id);
CREATE INDEX idx_tasks_done ON tasks(done);
CREATE INDEX idx_tasks_completed_at ON tasks(completed_at);

-- ============ GRADES TABLE ============
CREATE TABLE grades (
  id VARCHAR(32) PRIMARY KEY,
  child_id VARCHAR(32) NOT NULL,
  family_id VARCHAR(32) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  grade VARCHAR(10),
  xp INTEGER DEFAULT 0,
  gold INTEGER DEFAULT 0,
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_grade_child FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  CONSTRAINT fk_grade_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX idx_grades_child ON grades(child_id);
CREATE INDEX idx_grades_family ON grades(family_id);

-- ============ SANCTIONS TABLE ============
CREATE TABLE sanctions (
  id VARCHAR(32) PRIMARY KEY,
  child_id VARCHAR(32) NOT NULL,
  family_id VARCHAR(32) NOT NULL,
  motif VARCHAR(255) NOT NULL,
  gold INTEGER,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_sanction_child FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  CONSTRAINT fk_sanction_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX idx_sanctions_child ON sanctions(child_id);
CREATE INDEX idx_sanctions_family ON sanctions(family_id);

-- ============ REWARDS TABLE ============
CREATE TABLE rewards (
  id VARCHAR(32) PRIMARY KEY,
  family_id VARCHAR(32) NOT NULL,
  icon VARCHAR(10),
  name VARCHAR(255),
  cost INTEGER,
  lvl INTEGER DEFAULT 1,
  
  CONSTRAINT fk_reward_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX idx_rewards_family ON rewards(family_id);

-- ============ REWARD PURCHASES TABLE ============
CREATE TABLE reward_purchases (
  id UUID PRIMARY KEY,
  family_id VARCHAR(32) NOT NULL,
  child_id VARCHAR(32) NOT NULL,
  reward_id VARCHAR(32),
  purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cost INTEGER NOT NULL,
  
  CONSTRAINT fk_rp_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_child FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE,
  CONSTRAINT fk_rp_reward FOREIGN KEY (reward_id) REFERENCES rewards(id) ON DELETE SET NULL
);

CREATE INDEX idx_reward_purchases_family ON reward_purchases(family_id);
CREATE INDEX idx_reward_purchases_child ON reward_purchases(child_id);
CREATE INDEX idx_reward_purchases_date ON reward_purchases(purchase_date);

-- ============ TASK REQUESTS TABLE (approval workflow) ============
CREATE TABLE task_requests (
  id VARCHAR(32) PRIMARY KEY,
  family_id VARCHAR(32) NOT NULL,
  child_id VARCHAR(32) NOT NULL,
  task_name VARCHAR(255),
  xp INTEGER,
  gold INTEGER,
  status VARCHAR(20) DEFAULT 'pending',
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMP,
  
  CONSTRAINT fk_tr_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  CONSTRAINT fk_tr_child FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
);

CREATE INDEX idx_task_requests_family ON task_requests(family_id);
CREATE INDEX idx_task_requests_status ON task_requests(status);

-- ============ GRADE REQUESTS TABLE (approval workflow) ============
CREATE TABLE grade_requests (
  id VARCHAR(32) PRIMARY KEY,
  family_id VARCHAR(32) NOT NULL,
  child_id VARCHAR(32) NOT NULL,
  subject VARCHAR(255),
  grade VARCHAR(10),
  xp INTEGER,
  gold INTEGER,
  status VARCHAR(20) DEFAULT 'pending',
  submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  decided_at TIMESTAMP,
  
  CONSTRAINT fk_gr_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE,
  CONSTRAINT fk_gr_child FOREIGN KEY (child_id) REFERENCES children(id) ON DELETE CASCADE
);

CREATE INDEX idx_grade_requests_family ON grade_requests(family_id);
CREATE INDEX idx_grade_requests_status ON grade_requests(status);

-- ============ ACTION LOGS TABLE (audit trail) ============
CREATE TABLE action_logs (
  id VARCHAR(32) PRIMARY KEY,
  family_id VARCHAR(32),
  action_type VARCHAR(50),
  actor_email VARCHAR(255),
  target_child_id VARCHAR(32),
  details JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT fk_actionlog_family FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE INDEX idx_actionlog_family ON action_logs(family_id);
CREATE INDEX idx_actionlog_created ON action_logs(created_at);

-- ============ METADATA TABLE (config, secrets) ============
CREATE TABLE metadata (
  key VARCHAR(255) PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
