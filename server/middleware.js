import jwt from "jsonwebtoken";
import { validationResult } from "express-validator";
import { query } from "./db.js";

export function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ message: "Validation failed", errors: errors.array() });
  }
  return next();
}

export async function getProjectRole(projectId, userId) {
  const result = await query(
    "SELECT role FROM project_members WHERE project_id = $1 AND user_id = $2",
    [projectId, userId]
  );
  return result.rows[0]?.role || null;
}

export async function requireProjectMember(req, res, next) {
  const projectId = Number(req.params.projectId || req.body.projectId);
  const role = await getProjectRole(projectId, req.user.id);

  if (!role) {
    return res.status(403).json({ message: "You are not a member of this project" });
  }

  req.projectRole = role;
  return next();
}

export async function requireProjectAdmin(req, res, next) {
  const projectId = Number(req.params.projectId || req.body.projectId);
  const role = await getProjectRole(projectId, req.user.id);

  if (role !== "Admin") {
    return res.status(403).json({ message: "Admin access required" });
  }

  req.projectRole = role;
  return next();
}
