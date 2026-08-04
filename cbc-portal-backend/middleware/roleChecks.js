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
  if (!roles.includes("student") && !roles.includes("learner")) {
    return res.status(403).json({ message: "Forbidden: student role required" });
  }
  next();
};

// Class teacher guard
export const isClassTeacher = (req, res, next) => {
  const roles = getRoles(req.user);
  const isTeacher = roles.includes("teacher") || req.user?.role === "teacher";
  const isDean = req.user?.isDean === true;
  const isExplicitClassTeacher = req.user?.isClassTeacher === true || roles.includes("classteacher");

  // Allow teachers and deans through the same route path unless a grade scope is explicitly being enforced.
  if (isDean || isTeacher || isExplicitClassTeacher) {
    if (isDean) {
      return next();
    }

    const requestedGrade = req.query.grade || req.params.grade;
    const userClassGrade = req.user?.classGrade;

    if (requestedGrade && userClassGrade && requestedGrade !== userClassGrade) {
      return res.status(403).json({ message: "Unauthorized: not the assigned grade for this teacher" });
    }

    return next();
  }

  return res.status(403).json({ message: "Forbidden: teacher access required" });
};

export const accountsOnly = (req, res, next) => {
  if (!req.user || req.user.role !== "accounts") {
    return res.status(403).json({ message: "Accounts access only" });
  }
  next();
};
