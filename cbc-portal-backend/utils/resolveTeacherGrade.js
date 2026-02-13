import { User } from "../models/User.js";

export const resolveTeacherGrade = async (req) => {
  // Non-class teachers use query
  if (!req.user.roles?.includes("classteacher")) {
    return req.query.grade;
  }

  // Token already has grade
  if (req.user.classGrade) {
    return String(req.user.classGrade);
  }

  // Fallback: resolve from DB
  const teacher = await User.findById(req.user.id)
    .select("assignedClass isClassTeacher")
    .lean();

  if (!teacher || !teacher.isClassTeacher || !teacher.assignedClass) {
    throw new Error("Class teacher has no assigned class");
  }

  return String(teacher.assignedClass);
};
