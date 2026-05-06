import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  LogOut,
  Plus,
  Shield,
  Trash2,
  Users
} from "lucide-react";
import "./styles.css";

const TOKEN_KEY = "taskforge_token";
const USER_KEY = "taskforge_user";
const statuses = ["To Do", "In Progress", "Done"];
const priorities = ["Low", "Medium", "High"];

function api(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
  });
}

function AuthScreen({ onAuth }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const payload =
        mode === "signup"
          ? form
          : { email: form.email, password: form.password };
      const result = await api(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      localStorage.setItem(TOKEN_KEY, result.token);
      localStorage.setItem(USER_KEY, JSON.stringify(result.user));
      onAuth(result.user);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-row">
          <div className="brand-mark"><ClipboardList size={28} /></div>
          <div>
            <h1>TaskForge</h1>
            <p>Project work, team ownership, and task progress in one place.</p>
          </div>
        </div>

        <div className="segmented">
          <button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
            Login
          </button>
          <button className={mode === "signup" ? "active" : ""} onClick={() => setMode("signup")}>
            Signup
          </button>
        </div>

        <form onSubmit={submit} className="form-grid">
          {mode === "signup" && (
            <label>
              Name
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                minLength={2}
                required
              />
            </label>
          )}
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              minLength={6}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="primary" type="submit">
            {mode === "login" ? "Login" : "Create Account"}
          </button>
        </form>
      </section>
    </main>
  );
}

function Stat({ icon, label, value }) {
  return (
    <article className="stat">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function App() {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const [projects, setProjects] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState("");

  const selectedProject = detail?.project;
  const isAdmin = selectedProject?.role === "Admin";

  useEffect(() => {
    if (user) refresh();
  }, [user]);

  useEffect(() => {
    if (selectedId) loadProject(selectedId);
  }, [selectedId]);

  async function refresh() {
    setError("");
    try {
      const [projectData, dashboardData] = await Promise.all([
        api("/api/projects"),
        api("/api/dashboard")
      ]);
      setProjects(projectData);
      setDashboard(dashboardData);
      if (!selectedId && projectData[0]) setSelectedId(projectData[0].id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadProject(id) {
    try {
      setDetail(await api(`/api/projects/${id}`));
    } catch (err) {
      setError(err.message);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setDetail(null);
    setProjects([]);
  }

  if (!user) return <AuthScreen onAuth={setUser} />;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="side-brand">
          <ClipboardList />
          <div>
            <strong>TaskForge</strong>
            <span>{user.name}</span>
          </div>
        </div>
        <ProjectCreator onCreated={async (project) => {
          await refresh();
          setSelectedId(project.id);
        }} />
        <nav className="project-list">
          {projects.map((project) => (
            <button
              key={project.id}
              className={project.id === selectedId ? "active" : ""}
              onClick={() => setSelectedId(project.id)}
            >
              <span>{project.name}</span>
              <small>{project.role}</small>
            </button>
          ))}
        </nav>
        <button className="ghost logout" onClick={logout}><LogOut size={18} /> Logout</button>
      </aside>

      <section className="workspace">
        {error && <p className="error banner">{error}</p>}
        <Dashboard dashboard={dashboard} />
        {detail ? (
          <>
            <header className="project-header">
              <div>
                <p className="eyebrow">{selectedProject.role} workspace</p>
                <h2>{selectedProject.name}</h2>
                <span>{selectedProject.description || "No description"}</span>
              </div>
              <div className="header-counts">
                <span><Users size={16} /> {detail.members.length} members</span>
                <span><ClipboardList size={16} /> {detail.tasks.length} tasks</span>
              </div>
            </header>
            <TeamPanel
              members={detail.members}
              isAdmin={isAdmin}
              projectId={selectedProject.id}
              currentUserId={user.id}
              onChange={() => loadProject(selectedProject.id)}
            />
            <TaskPanel
              tasks={detail.tasks}
              members={detail.members}
              isAdmin={isAdmin}
              currentUserId={user.id}
              projectId={selectedProject.id}
              onChange={async () => {
                await loadProject(selectedProject.id);
                await refresh();
              }}
            />
          </>
        ) : (
          <section className="empty-state">Create a project to start assigning team tasks.</section>
        )}
      </section>
    </main>
  );
}

function ProjectCreator({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  async function submit(event) {
    event.preventDefault();
    const project = await api("/api/projects", { method: "POST", body: JSON.stringify(form) });
    setForm({ name: "", description: "" });
    setOpen(false);
    onCreated(project);
  }

  return open ? (
    <form className="quick-form" onSubmit={submit}>
      <input placeholder="Project name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
      <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <button className="primary" type="submit">Create</button>
    </form>
  ) : (
    <button className="primary icon-button" onClick={() => setOpen(true)}><Plus size={18} /> New Project</button>
  );
}

function Dashboard({ dashboard }) {
  if (!dashboard) return null;
  return (
    <section className="dashboard">
      <Stat icon={<BarChart3 />} label="Total tasks" value={dashboard.total_tasks} />
      <Stat icon={<ClipboardList />} label="To do" value={dashboard.todo} />
      <Stat icon={<CalendarClock />} label="In progress" value={dashboard.in_progress} />
      <Stat icon={<CheckCircle2 />} label="Done" value={dashboard.done} />
      <Stat icon={<Shield />} label="Overdue" value={dashboard.overdue} />
      <div className="per-user">
        <span>Tasks per user</span>
        {dashboard.perUser.map((item) => (
          <p key={item.name}><strong>{item.name}</strong><b>{item.count}</b></p>
        ))}
      </div>
    </section>
  );
}

function TeamPanel({ members, isAdmin, projectId, currentUserId, onChange }) {
  const [form, setForm] = useState({ email: "", role: "Member" });

  async function addMember(event) {
    event.preventDefault();
    await api(`/api/projects/${projectId}/members`, {
      method: "POST",
      body: JSON.stringify(form)
    });
    setForm({ email: "", role: "Member" });
    onChange();
  }

  async function removeMember(userId) {
    await api(`/api/projects/${projectId}/members/${userId}`, { method: "DELETE" });
    onChange();
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <h3>Team</h3>
        <span>{isAdmin ? "Admin controls enabled" : "Member view"}</span>
      </div>
      {isAdmin && (
        <form className="member-form" onSubmit={addMember}>
          <input placeholder="member@email.com" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option>Member</option>
            <option>Admin</option>
          </select>
          <button className="primary" type="submit">Add</button>
        </form>
      )}
      <div className="member-grid">
        {members.map((member) => (
          <article className="member" key={member.id}>
            <div>
              <strong>{member.name}</strong>
              <span>{member.email}</span>
            </div>
            <small>{member.role}</small>
            {isAdmin && member.id !== currentUserId && (
              <button className="icon-only" title="Remove member" onClick={() => removeMember(member.id)}>
                <Trash2 size={16} />
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

function TaskPanel({ tasks, members, isAdmin, currentUserId, projectId, onChange }) {
  const [form, setForm] = useState({
    title: "",
    description: "",
    dueDate: new Date().toISOString().slice(0, 10),
    priority: "Medium",
    assignedTo: ""
  });

  const visibleTasks = useMemo(() => {
    return isAdmin ? tasks : tasks.filter((task) => task.assigned_to === currentUserId);
  }, [tasks, isAdmin, currentUserId]);

  async function createTask(event) {
    event.preventDefault();
    await api(`/api/projects/${projectId}/tasks`, {
      method: "POST",
      body: JSON.stringify({ ...form, assignedTo: form.assignedTo || null })
    });
    setForm({ title: "", description: "", dueDate: new Date().toISOString().slice(0, 10), priority: "Medium", assignedTo: "" });
    onChange();
  }

  async function updateTask(taskId, patch) {
    await api(`/api/projects/${projectId}/tasks/${taskId}`, {
      method: "PATCH",
      body: JSON.stringify(patch)
    });
    onChange();
  }

  async function deleteTask(taskId) {
    await api(`/api/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" });
    onChange();
  }

  return (
    <section className="panel">
      <div className="panel-title">
        <h3>Tasks</h3>
        <span>{isAdmin ? "Create and assign work" : "Update your assigned work"}</span>
      </div>
      {isAdmin && (
        <form className="task-form" onSubmit={createTask}>
          <input placeholder="Task title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} required />
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
            {priorities.map((priority) => <option key={priority}>{priority}</option>)}
          </select>
          <select value={form.assignedTo} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}>
            <option value="">Unassigned</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
          </select>
          <button className="primary" type="submit">Create Task</button>
        </form>
      )}
      <div className="task-board">
        {statuses.map((status) => (
          <section className="column" key={status}>
            <h4>{status}</h4>
            {visibleTasks.filter((task) => task.status === status).map((task) => (
              <article className={`task priority-${task.priority.toLowerCase()}`} key={task.id}>
                <div className="task-top">
                  <strong>{task.title}</strong>
                  {isAdmin && <button className="icon-only" title="Delete task" onClick={() => deleteTask(task.id)}><Trash2 size={15} /></button>}
                </div>
                <p>{task.description || "No description"}</p>
                <div className="task-meta">
                  <span>{task.priority}</span>
                  <span>{new Date(task.due_date).toLocaleDateString()}</span>
                </div>
                <small>Assigned to {task.assignee_name || "Unassigned"}</small>
                <select value={task.status} onChange={(e) => updateTask(task.id, { status: e.target.value })}>
                  {statuses.map((item) => <option key={item}>{item}</option>)}
                </select>
              </article>
            ))}
          </section>
        ))}
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
