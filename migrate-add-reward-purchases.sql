-- Migration: add reward_purchases (tracks when a child buys a reward)
-- Compatible SQLite + PostgreSQL. id has no DB default: the app generates the UUID
-- (gen_random_uuid() is PostgreSQL-only).
-- reward_id is nullable / ON DELETE SET NULL so deleting a reward keeps purchase history.

-- ============ REWARD PURCHASES TABLE ============
CREATE TABLE IF NOT EXISTS reward_purchases (
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

CREATE INDEX IF NOT EXISTS idx_reward_purchases_family ON reward_purchases(family_id);
CREATE INDEX IF NOT EXISTS idx_reward_purchases_child ON reward_purchases(child_id);
CREATE INDEX IF NOT EXISTS idx_reward_purchases_date ON reward_purchases(purchase_date);
