// controllers/LearnerController.js

import { Student } from "../models/RoleModels.js";

/* =====================================================
   GET ALL LEARNERS (FOR ELECTIVES UI)
===================================================== */
export const getStudents = async (req, res) => {
  try {
    const { grade, search, limit = 100, page = 1 } = req.query;

    const query = {};

    // filter by grade
    if (grade) {
      query.grade = grade;
    }

    // search by name or admission number
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { admission: { $regex: search, $options: "i" } },
        { admissionNumber: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);

    const learners = await Student.find(query)
      .select("name admission admissionNumber grade stream electives")
      .limit(Number(limit))
      .skip(skip)
      .sort({ name: 1 });

    const total = await Student.countDocuments(query);

    return res.json({
      data: learners,
      pagination: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("getStudents error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};