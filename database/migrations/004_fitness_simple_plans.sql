ALTER TABLE workout_templates ADD COLUMN starts_on TEXT;
ALTER TABLE workout_templates ADD COLUMN repeat_weeks INTEGER NOT NULL DEFAULT 1;
ALTER TABLE body_metrics ADD COLUMN upper_arm REAL;
