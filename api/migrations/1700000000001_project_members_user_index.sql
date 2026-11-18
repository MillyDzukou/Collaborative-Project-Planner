-- Up Migration

-- Found by Step 13 load testing: listing a user's projects (GET /projects) and counting them
-- filter project_members by user_id, but the only index there is the (project_id, user_id)
-- primary key, which can't serve a user_id lookup. With 200k membership rows that was a
-- sequential scan (~18-20 ms per query, growing linearly with the table, and stealing CPU from
-- every other request). Leading with user_id (and including project_id) lets both the list join
-- and the count be answered from the index alone.
CREATE INDEX idx_project_members_user_id ON project_members (user_id, project_id);

-- Down Migration

DROP INDEX IF EXISTS idx_project_members_user_id;
