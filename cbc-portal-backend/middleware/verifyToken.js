//middleware/verifyToken
import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { School } from "../models/school.js";
import { getPlanFeatures, normalizePlan } from "../utils/planAccess.js";

const verifyToken = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "No token provided" });
    }

    const token = header.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.id);
    if (!user) return res.status(401).json({ message: "Invalid token" });

    const rolesNeedingSchool = ["admin", "accounts", "teacher", "student", "learner", "parent", "classteacher"];
    if (rolesNeedingSchool.includes(user.role) && !user.schoolId) {
      return res.status(403).json({ message: "Your account is not assigned to a school" });
    }

    let school = null;
    let schoolPlanFeatures = getPlanFeatures('basic');
    if (user.schoolId) {
      school = await School.findById(user.schoolId).select("status version plan planFeatures");
      if (!school) {
        return res.status(403).json({ message: "Your school does not exist. Contact admin." });
      }

      schoolPlanFeatures = {
        ...getPlanFeatures(school.plan || 'basic'),
        ...(school.planFeatures || {})
      };

     // Only enforce version check if token contains schoolVersion
          if (
            decoded.schoolVersion !== undefined &&
            decoded.schoolVersion !== school.version
          ) {
            return res.status(403).json({
              message: "Your session has expired due to school status change. Please log in again."
            });
          }


      if (school.status === "Suspended") {
        return res.status(403).json({ message: "Your school is suspended. Contact admin." });
      }
    }

    req.user = {
      id: user._id.toString(),
      name: user.name,
      role: user.role,
      roles: [user.role].concat(
        user.isClassTeacher && user.role !== "classteacher" ? ["classteacher"] : []
      ),
      schoolId: user.schoolId ? String(user.schoolId) : null,
      isClassTeacher: user.isClassTeacher || false,
      isDean: user.isDean || false,
      classGrade: user.assignedClass || user.grade || null, 
      classStream: user.assignedStream || null,
      isSuperAdmin: user.role === "super_admin",
      isSchoolAdmin: user.role === "admin",
      admission: user.admission || null,
      schoolPlan: school?.plan ? normalizePlan(school.plan) : 'basic',
      schoolPlanFeatures,
      canCreate: (targetRole) => {
      if (user.role === "super_admin") return true;
      if (user.role === "admin") {
        return ["teacher", "student", "learner", "classteacher", "accounts"].includes(targetRole);
      }
      return false;
    },
      hasFeature: (feature) => {
        if (user.role === 'super_admin') return true;
        const flag = schoolPlanFeatures[feature];
        return flag === true;
      }
    };

    next();
  } catch (err) {
    console.error("Verify Token Error:", err);
    return res.status(401).json({ message: "Token invalid or expired" });
  }
};

export default verifyToken;
