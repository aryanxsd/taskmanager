# TaskForge - Team Task Management App

TaskForge is a full-stack team task management web application deployed on Render with a Supabase PostgreSQL database. Users can sign up, create projects, invite members, assign tasks, update task status, and view dashboard metrics.

## Features

- Signup and login with JWT authentication
- Project creation with creator assigned as `Admin`
- Admin controls for adding/removing project members
- Task creation with title, description, due date, priority, assignee, and status
- Role-based access control:
  - Admins can manage project users and all tasks
  - Members can view and update only their assigned tasks
- Dashboard with total tasks, status counts, overdue tasks, and tasks per user
- RESTful Express APIs backed by PostgreSQL
- Production build serves React frontend from the Express server

## Tech Stack

- Frontend: React, Vite, lucide-react
- Backend: Node.js, Express
- Database: PostgreSQL
- Auth: JWT, bcrypt password hashing
- Deployment: Render
- Hosted database: Supabase PostgreSQL

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from the example:

```bash
cp .env.example .env
```

3. Update `.env` with a PostgreSQL connection string:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/team_tasks
JWT_SECRET=replace-with-a-long-random-secret
CLIENT_ORIGIN=http://localhost:5173
PORT=5000
```

4. Start the development servers:

```bash
npm run dev
```

The frontend runs at `http://localhost:5173` and proxies API calls to `http://localhost:5000`.

## Render Deployment

1. Push this folder to GitHub.
2. Open Render and create a new Web Service.
3. Connect the GitHub repository.
4. Use these service settings:

```text
Language: Node
Branch: main
Build Command: npm install --include=dev && npm run build
Start Command: npm start
```

5. Set environment variables on the Render web service:

```env
DATABASE_URL=your-supabase-postgres-connection-string
JWT_SECRET=your-long-production-secret
NODE_ENV=production
```

6. Render will install dependencies and run the production build:

```bash
npm run build
```

7. Render will start the app with:

```bash
npm start
```

The app exposes `/api/health` for health checks. Database tables are created automatically when the server starts.

## API Overview

- `POST /api/auth/signup`
- `POST /api/auth/login`
- `GET /api/users`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:projectId`
- `POST /api/projects/:projectId/members`
- `DELETE /api/projects/:projectId/members/:userId`
- `POST /api/projects/:projectId/tasks`
- `PATCH /api/projects/:projectId/tasks/:taskId`
- `DELETE /api/projects/:projectId/tasks/:taskId`
- `GET /api/dashboard`

## Demo Video Checklist

For a 2-5 minute walkthrough, show:

1. Signup/login
2. Creating a project
3. Adding a second registered user by email
4. Creating and assigning tasks
5. Updating task status as Admin and Member
6. Dashboard metrics and overdue task count
7. Render live URL and environment variable setup
