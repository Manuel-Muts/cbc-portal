// middleware/roleChecks.js

// Normalize roles to an array of lowercase strings
function getRoles(user) {
  if (!user) return [];
  const raw = user.roles ?? user.role ?? [];
  const arr = Array.isArray(raw) ? raw : [raw];
  return arr.filter(Boolean).map(r => String(r).toLowerCase());
}

// Admin guard
export const isAdmin = (req, res, next) => {
  const roles = getRoles(req.user);
  if (!roles.includes("admin")) {
    return res.status(403).json({ message: "Forbidden: admin role required" });
  }
  next();
};

// Student guard
export const isStudent = (req, res, next) => {
  const roles = getRoles(req.user);
  if (!roles.includes("student")) {
    return res.status(403).json({ message: "Forbidden: student role required" });
  }
  next();
};

// Class teacher guard
export const isClassTeacher = (req, res, next) => {
  const roles = getRoles(req.user);
  const ok = roles.includes("classteacher") || req.user?.isClassTeacher === true;
  if (!ok) {
    return res.status(403).json({ message: "Forbidden: class teacher role required" });
  }

  // Optional: enforce grade scoping
  const requestedGrade = req.query.grade || req.params.grade;
  const userClassGrade = req.user?.classGrade;
  if (requestedGrade && userClassGrade && requestedGrade !== userClassGrade) {
    return res.status(403).json({ message: "Unauthorized: not the class teacher for this grade" });
  }

  next();
};