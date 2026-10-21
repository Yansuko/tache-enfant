-- Insert demo user
INSERT INTO users (id, email, name, password_salt, password_hash)
VALUES (
  '11111111-1111-1111-1111-111111111111'::UUID,
  'parent@demo.fr',
  'Parent Démo',
  'salt-demo-12345678901234567890',
  'hash-demo-1234567890123456789012345678901234567890123456789012345678901234'
);

-- Insert demo family
INSERT INTO families (id, owner_id, name, day, daily_bonus_xp, daily_bonus_gold, created_at, updated_at)
VALUES (
  'fam-demo',
  '11111111-1111-1111-1111-111111111111'::UUID,
  'Famille Démo',
  '',
  30,
  15,
  NOW(),
  NOW()
);

-- Insert family member
INSERT INTO family_members (family_id, user_id, role, invited_at)
VALUES (
  'fam-demo',
  '11111111-1111-1111-1111-111111111111'::UUID,
  'owner',
  NOW()
);

-- Insert demo children
INSERT INTO children (id, family_id, name, xp, gold, pin, created_at, updated_at)
VALUES
  ('child-emma-demo', 'fam-demo', 'Emma', 450, 280, '0000', NOW(), NOW()),
  ('child-lucas-demo', 'fam-demo', 'Lucas', 90, 64, '1111', NOW(), NOW()),
  ('child-test-demo', 'fam-demo', 'Test', 50, 30, '2222', NOW(), NOW());

-- Insert demo tasks for Emma
INSERT INTO tasks (id, child_id, family_id, icon, name, xp, gold, done, daily, frequency, completed_at, created_at)
VALUES
  ('task-1', 'child-emma-demo', 'fam-demo', '🧹', 'Ranger sa chambre', 20, 10, TRUE, TRUE, 'daily', NOW(), NOW()),
  ('task-2', 'child-emma-demo', 'fam-demo', '📚', 'Faire ses devoirs', 30, 15, TRUE, TRUE, 'daily', NOW(), NOW()),
  ('task-3', 'child-emma-demo', 'fam-demo', '🍽️', 'Mettre la table', 10, 5, TRUE, FALSE, NULL, NOW() - INTERVAL '1 day', NOW());

-- Insert demo tasks for Lucas
INSERT INTO tasks (id, child_id, family_id, icon, name, xp, gold, done, daily, frequency, completed_at, created_at)
VALUES
  ('task-4', 'child-lucas-demo', 'fam-demo', '🧹', 'Ranger sa chambre', 20, 10, FALSE, TRUE, 'daily', NULL, NOW()),
  ('task-5', 'child-lucas-demo', 'fam-demo', '📚', 'Faire ses devoirs', 30, 15, FALSE, TRUE, 'daily', NULL, NOW());

-- Insert demo rewards
INSERT INTO rewards (id, family_id, icon, name, cost, lvl)
VALUES
  ('reward-1', 'fam-demo', '🎮', '30 min de jeu vidéo', 50, 1),
  ('reward-2', 'fam-demo', '🍿', 'Soirée film + popcorn', 80, 2),
  ('reward-3', 'fam-demo', '💶', '5€ d''argent de poche', 150, 3);

-- Insert demo sanctions list (just metadata, not applied)
-- The sanctionsList is stored in the family data structure
