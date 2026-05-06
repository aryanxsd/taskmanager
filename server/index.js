import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { body, param } from "express-validator";
import { initDb, pool, query } from "./db.js";
import {
  getProjectRole,
  requireAuth,
  requireProjectAdmin,
  requireProjectMember,
  validate
} from "./middleware.js";

const app = express();
const port = process.env.PORT || 5000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET is required");
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.CLIENT_ORIGIN || true, credentials: true }));
app.use(express.json());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 400 }));

function signToken(user) {
  return jwt.sign({ id: user.id, email: user.email, name: user.name }, process.env.JWT_SECRET, {
    expiresIn: "7d"
  });
}

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post(
  "/api/auth/signup",
  body("name").trim().isLength({ min: 2, max: 120 }),
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 6, max: 120 }),
  validate,
  async (req, res) => {
    const { name, email, password } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);

    try {
      const result = await query(
        "INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email",
        [name, email, passwordHash]
      );
      const user = result.rows[0];
      res.status(201).json({ token: signToken(user), user: publicUser(user) });
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({ message: "Email is already registered" });
      }
      throw error;
    }
  }
);

app.post(
  "/api/auth/login",
  body("email").isEmail().normalizeEmail(),
  body("password").isLength({ min: 1 }),
  validate,
  async (req, res) => {
    const result = await query("SELECT * FROM users WHERE email = $1", [req.body.email]);
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(req.body.password, user.password_hash))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    res.json({ token: signToken(user), user: publicUser(user) });
  }
);

app.get("/api/users", requireAuth, async (_req, res) => {
  const result = await query("SELECT id, name, email FROM users ORDER BY name ASC");
  res.json(result.rows);
});

app.get("/api/projects", requireAuth, async (req, res) => {
  const result = await query(
    `SELECT p.*, pm.role,
      COUNT(DISTINCT t.id)::int AS task_count,
      COUNT(DISTINCT member.user_id)::int AS member_count
     FROM projects p
     JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
     LEFT JOIN tasks t ON t.project_id = p.id
     LEFT JOIN project_members member ON member.project_id = p.id
     GROUP BY p.id, pm.role
     ORDER BY p.created_at DESC`,
    [req.user.id]
  );
  res.json(result.rows);
});

app.post(
  "/api/projects",
  requireAuth,
  body("name").trim().isLength({ min: 2, max: 160 }),
  body("description").optional().trim().isLength({ max: 2000 }),
  validate,
  async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const projectResult = await client.query(
        "INSERT INTO projects (name, description, created_by) VALUES ($1, $2, $3) RETURNING *",
        [req.body.name, req.body.description || "", req.user.id]
      );
      const project = projectResult.rows[0];
      await client.query(
        "INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'Admin')",
        [project.id, req.user.id]
      );
      await client.query("COMMIT");
      res.status(201).json({ ...project, role: "Admin", task_count: 0, member_count: 1 });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
);

app.get(
  "/api/projects/:projectId",
  requireAuth,
  param("projectId").isInt(),
  validate,
  requireProjectMember,
  async (req, res) => {
    const projectId = Number(req.params.projectId);
    const taskFilter =
      req.projectRole === "Admin" ? "t.project_id = $1" : "t.project_id = $1 AND t.assigned_to = $2";
    const taskParams = req.projectRole === "Admin" ? [projectId] : [projectId, req.user.id];
    const [projectResult, membersResult, tasksResult] = await Promise.all([
      query("SELECT * FROM projects WHERE id = $1", [projectId]),
      query(
        `SELECT u.id, u.name, u.email, pm.role
         FROM project_members pm
         JOIN users u ON u.id = pm.user_id
         WHERE pm.project_id = $1
         ORDER BY pm.role ASC, u.name ASC`,
        [projectId]
      ),
      query(
        `SELECT t.*, u.name AS assignee_name, creator.name AS creator_name
         FROM tasks t
         LEFT JOIN users u ON u.id = t.assigned_to
         JOIN users creator ON creator.id = t.created_by
         WHERE ${taskFilter}
         ORDER BY t.due_date ASC, t.created_at DESC`,
        taskParams
      )
    ]);

    if (!projectResult.rows[0]) {
      return res.status(404).json({ message: "Project not found" });
    }

    res.json({
      project: { ...projectResult.rows[0], role: req.projectRole },
      members: membersResult.rows,
      tasks: tasksResult.rows
    });
  }
);

app.post(
  "/api/projects/:projectId/members",
  requireAuth,
  param("projectId").isInt(),
  body("email").isEmail().normalizeEmail(),
  body("role").isIn(["Admin", "Member"]),
  validate,
  requireProjectAdmin,
  async (req, res) => {
    const userResult = await query("SELECT id FROM users WHERE email = $1", [req.body.email]);
    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({ message: "No user found for that email" });
    }

    await query(
      `INSERT INTO project_members (project_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (project_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [Number(req.params.projectId), user.id, req.body.role]
    );

    res.status(201).json({ message: "Member saved" });
  }
);

app.delete(
  "/api/projects/:projectId/members/:userId",
  requireAuth,
  param("projectId").isInt(),
  param("userId").isInt(),
  validate,
  requireProjectAdmin,
  async (req, res) => {
    const projectId = Number(req.params.projectId);
    const userId = Number(req.params.userId);

    if (userId === req.user.id) {
      return res.status(400).json({ message: "Admins cannot remove themselves" });
    }

    await query("DELETE FROM project_members WHERE project_id = $1 AND user_id = $2", [
      projectId,
      userId
    ]);
    await query(
      "UPDATE tasks SET assigned_to = NULL WHERE project_id = $1 AND assigned_to = $2",
      [projectId, userId]
    );
    res.json({ message: "Member removed" });
  }
);

app.post(
  "/api/projects/:projectId/tasks",
  requireAuth,
  param("projectId").isInt(),
  body("title").trim().isLength({ min: 2, max: 180 }),
  body("description").optional().trim().isLength({ max: 2000 }),
  body("dueDate").isISO8601().toDate(),
  body("priority").isIn(["Low", "Medium", "High"]),
  body("assignedTo").optional({ nullable: true }).isInt(),
  validate,
  requireProjectAdmin,
  async (req, res) => {
    const projectId = Number(req.params.projectId);
    if (req.body.assignedTo) {
      const role = await getProjectRole(projectId, Number(req.body.assignedTo));
      if (!role) {
        return res.status(400).json({ message: "Assignee must be a project member" });
      }
    }

    const result = await query(
      `INSERT INTO tasks (project_id, title, description, due_date, priority, assigned_to, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        projectId,
        req.body.title,
        req.body.description || "",
        req.body.dueDate,
        req.body.priority,
        req.body.assignedTo || null,
        req.user.id
      ]
    );
    res.status(201).json(result.rows[0]);
  }
);

app.patch(
  "/api/projects/:projectId/tasks/:taskId",
  requireAuth,
  param("projectId").isInt(),
  param("taskId").isInt(),
  body("title").optional().trim().isLength({ min: 2, max: 180 }),
  body("description").optional().trim().isLength({ max: 2000 }),
  body("dueDate").optional().isISO8601().toDate(),
  body("priority").optional().isIn(["Low", "Medium", "High"]),
  body("status").optional().isIn(["To Do", "In Progress", "Done"]),
  body("assignedTo").optional({ nullable: true }).isInt(),
  validate,
  requireProjectMember,
  async (req, res) => {
    const projectId = Number(req.params.projectId);
    const taskId = Number(req.params.taskId);
    const currentResult = await query("SELECT * FROM tasks WHERE id = $1 AND project_id = $2", [
      taskId,
      projectId
    ]);
    const current = currentResult.rows[0];

    if (!current) {
      return res.status(404).json({ message: "Task not found" });
    }

    const isAdmin = req.projectRole === "Admin";
    const isAssignee = current.assigned_to === req.user.id;

    if (!isAdmin && !isAssignee) {
      return res.status(403).json({ message: "Members can update assigned tasks only" });
    }

    if (!isAdmin && Object.keys(req.body).some((key) => key !== "status")) {
      return res.status(403).json({ message: "Members can update task status only" });
    }

    const assignedTo = Object.hasOwn(req.body, "assignedTo") ? req.body.assignedTo : current.assigned_to;
    if (assignedTo) {
      const role = await getProjectRole(projectId, Number(assignedTo));
      if (!role) {
        return res.status(400).json({ message: "Assignee must be a project member" });
      }
    }

    const result = await query(
      `UPDATE tasks
       SET title = $1, description = $2, due_date = $3, priority = $4, status = $5,
           assigned_to = $6, updated_at = NOW()
       WHERE id = $7 AND project_id = $8
       RETURNING *`,
      [
        req.body.title ?? current.title,
        req.body.description ?? current.description,
        req.body.dueDate ?? current.due_date,
        req.body.priority ?? current.priority,
        req.body.status ?? current.status,
        assignedTo || null,
        taskId,
        projectId
      ]
    );
    res.json(result.rows[0]);
  }
);

app.delete(
  "/api/projects/:projectId/tasks/:taskId",
  requireAuth,
  param("projectId").isInt(),
  param("taskId").isInt(),
  validate,
  requireProjectAdmin,
  async (req, res) => {
    await query("DELETE FROM tasks WHERE id = $1 AND project_id = $2", [
      Number(req.params.taskId),
      Number(req.params.projectId)
    ]);
    res.json({ message: "Task deleted" });
  }
);

app.get("/api/dashboard", requireAuth, async (req, res) => {
  const result = await query(
    `SELECT
      COUNT(t.id)::int AS total_tasks,
      COUNT(t.id) FILTER (WHERE t.status = 'To Do')::int AS todo,
      COUNT(t.id) FILTER (WHERE t.status = 'In Progress')::int AS in_progress,
      COUNT(t.id) FILTER (WHERE t.status = 'Done')::int AS done,
      COUNT(t.id) FILTER (WHERE t.due_date < CURRENT_DATE AND t.status != 'Done')::int AS overdue
     FROM tasks t
     JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = $1
     WHERE pm.role = 'Admin' OR t.assigned_to = $1`,
    [req.user.id]
  );

  const perUser = await query(
    `SELECT COALESCE(u.name, 'Unassigned') AS name, COUNT(t.id)::int AS count
     FROM tasks t
     JOIN project_members pm ON pm.project_id = t.project_id AND pm.user_id = $1
     LEFT JOIN users u ON u.id = t.assigned_to
     WHERE pm.role = 'Admin' OR t.assigned_to = $1
     GROUP BY u.name
     ORDER BY count DESC, name ASC`,
    [req.user.id]
  );

  res.json({ ...result.rows[0], perUser: perUser.rows });
});

const clientDist = path.join(__dirname, "..", "client", "dist");
app.use(express.static(clientDist));
app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  res.sendFile(path.join(clientDist, "index.html"));
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ message: "Server error" });
});

await initDb();
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
