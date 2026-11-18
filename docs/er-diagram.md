# Entity-relationship diagram

```mermaid
erDiagram
    USERS ||--o{ PROJECTS : creates
    USERS ||--o{ PROJECT_MEMBERS : joins
    PROJECTS ||--o{ PROJECT_MEMBERS : has
    PROJECTS ||--o{ TASKS : contains
    USERS ||--o{ TASKS : "assigned to"
    TASKS ||--o{ TASK_DEPENDENCIES : "is predecessor in"
    TASKS ||--o{ TASK_DEPENDENCIES : "is successor in"

    USERS {
        int id PK
        text email UK
        text password_hash
        text name
        timestamptz created_at
    }
    PROJECTS {
        int id PK
        text name
        text description
        int created_by FK
        timestamptz created_at
    }
    PROJECT_MEMBERS {
        int project_id PK_FK
        int user_id PK_FK
        enum role
    }
    TASKS {
        int id PK
        int project_id FK
        text name
        int duration_weeks
        text status
        int assignee_id FK
        numeric cost
        int version
        timestamptz updated_at
    }
    TASK_DEPENDENCIES {
        int task_id PK_FK
        int depends_on_task_id PK_FK
    }
```

`task_dependencies` is finish-to-start: a task cannot start until every task it
depends on has finished. The `(task_id, depends_on_task_id)` pair is the
primary key (so a dependency can't be duplicated) and `task_id <>
depends_on_task_id` is enforced by a check constraint (no self-dependency).
Cycle detection across multiple tasks happens in application code (Step 6), not
the database.
