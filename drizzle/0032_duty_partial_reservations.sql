ALTER TABLE duty_shifts ADD COLUMN reserved_count INTEGER NOT NULL DEFAULT 0 CHECK (reserved_count >= 0 AND reserved_count <= capacity);
-- Legacy fully reserved shifts already include their bookings in capacity.
UPDATE duty_shifts SET reserved_count = MAX(0, capacity - (SELECT COUNT(*) FROM duty_bookings WHERE shift_id = duty_shifts.id)) WHERE reserved = 1;
