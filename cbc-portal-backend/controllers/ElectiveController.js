// controllers/ElectiveController.js

import mongoose from "mongoose";
import ElectiveSet from "../models/ElectiveSet.js";
import LearnerElective from "../models/LearnerElective.js";
import { Student } from "../models/RoleModels.js";

/* =====================================================
   ELECTIVE SETS
===================================================== */

// CREATE ELECTIVE SET
export const createElectiveSet = async (req, res) => {
  try {
    const { name, grade, maxSubjects, status, subjects } = req.body;

    if (!name || !grade || !subjects?.length) {
      return res.status(400).json({ message: "Missing required fields" });
    }

     // 🔥 FIX: get schoolId from auth middleware
    const schoolId = req.user?.schoolId;

    if (!schoolId) {
      return res.status(403).json({ message: "School context missing in token" });
    }

    const set = await ElectiveSet.create({
      name,
      grade,
      maxSubjects: maxSubjects || 3,
      status: status || "active",
      subjects,
      createdBy: req.user?._id,
      schoolId, // ✅ REQUIRED FIX
    });

    return res.status(201).json({
      message: "Elective set created successfully",
      data: set,
    });
  } catch (err) {
    console.error("createElectiveSet error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET ALL ELECTIVE SETS
export const getElectiveSets = async (req, res) => {
  try {
    const sets = await ElectiveSet.find().sort({ createdAt: -1 });

    return res.json({
      data: sets,
    });
  } catch (err) {
    console.error("getElectiveSets error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// UPDATE ELECTIVE SET
export const updateElectiveSet = async (req, res) => {
  try {
    const { id } = req.params;

    const updated = await ElectiveSet.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Elective set not found" });
    }

    return res.json({
      message: "Elective set updated successfully",
      data: updated,
    });
  } catch (err) {
    console.error("updateElectiveSet error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

// DELETE ELECTIVE SET
export const deleteElectiveSet = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await ElectiveSet.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Elective set not found" });
    }

    // also remove related assignments
    await LearnerElective.deleteMany({ electiveSetId: id });

    return res.json({
      message: "Elective set deleted successfully",
    });
  } catch (err) {
    console.error("deleteElectiveSet error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =====================================================
   ELECTIVE ASSIGNMENTS
===================================================== */

// ASSIGN ONE LEARNER
export const assignElectiveSet = async (req, res) => {
  try {
    const schoolId = req.user?.schoolId;
    const { learnerId, electiveSetId } = req.body;

    if (!schoolId) {
      return res.status(403).json({ message: "Missing school context" });
    }

    if (!learnerId || !electiveSetId) {
      return res.status(400).json({ message: "Missing learnerId or electiveSetId" });
    }

    const learner = await Student.findById(learnerId);
    if (!learner) return res.status(404).json({ message: "Learner not found" });

    const set = await ElectiveSet.findOne({ _id: electiveSetId, schoolId });
    if (!set) return res.status(404).json({ message: "Elective set not found" });

    const existing = await LearnerElective.findOne({
      learnerId,
      electiveSetId,
      schoolId,
    });

    if (existing) {
      return res.status(409).json({ message: "Already assigned" });
    }

    const assignment = await LearnerElective.create({
      learnerId,
      electiveSetId,
      schoolId,
      grade: learner.grade,
      subjects: set.subjects,
      assignedBy: req.user?._id,
    });

    return res.status(201).json({
      message: "Assigned successfully",
      data: assignment,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

// BULK ASSIGN
export const bulkAssignElectiveSet = async (req, res) => {
  try {
    const schoolId = req.user?.schoolId;
    const { learnerIds, electiveSetId } = req.body;

    if (!schoolId) {
      return res.status(403).json({ message: "Missing school context" });
    }

    if (!Array.isArray(learnerIds) || !electiveSetId) {
      return res.status(400).json({ message: "Invalid payload" });
    }

    const set = await ElectiveSet.findOne({ _id: electiveSetId, schoolId });
    if (!set) {
      return res.status(404).json({ message: "Elective set not found" });
    }

    const learners = await Student.find({
      _id: { $in: learnerIds },
      schoolId,
    });

    const existing = await LearnerElective.find({
      learnerId: { $in: learnerIds },
      electiveSetId,
      schoolId,
    });

    const existingIds = new Set(existing.map(e => String(e.learnerId)));

    const newAssignments = learners
      .filter(l => !existingIds.has(String(l._id)))
      .map(l => ({
        learnerId: l._id,
        electiveSetId,
        schoolId,
        grade: l.grade,
        subjects: set.subjects,
        assignedBy: req.user?._id,
      }));

    const created = await LearnerElective.insertMany(newAssignments);

    return res.json({
      message: "Bulk assignment completed",
      data: created,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET ALL ASSIGNMENTS
export const getAssignments = async (req, res) => {
  try {
    const schoolId = req.user?.schoolId;
    // Support server-side pagination: page & limit
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.max(1, parseInt(req.query.limit || '20', 10));

    const match = { schoolId: new mongoose.Types.ObjectId(String(schoolId)) };

    const pathway = req.query.pathway ? String(req.query.pathway).trim() : null;
    const q = req.query.q ? String(req.query.q).trim() : null;

    const pipeline = [
      { $match: match },
      { $lookup: { from: 'users', localField: 'learnerId', foreignField: '_id', as: 'learner' } },
      { $unwind: { path: '$learner', preserveNullAndEmptyArrays: true } },
      // Optional server-side filtering on learner fields
      // (pathway and q search will be applied after we have learner in the pipeline)
      // We will push an additional $match later when needed
      { $lookup: { from: 'electivesets', localField: 'electiveSetId', foreignField: '_id', as: 'electiveSet' } },
        { $unwind: { path: '$electiveSet', preserveNullAndEmptyArrays: true } },
    ];

    // Insert an additional $match stage after unwind if pathway/q provided
    if (pathway || q) {
      const andClauses = [];
      if (pathway) {
        // match exact pathway (case-insensitive)
        andClauses.push({ 'learner.pathway': { $regex: new RegExp(`^${pathway.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
      }
      if (q) {
        // 🆕 Smart filtering: exact match for numeric admission, regex for names
        const isNumericSearch = /^\d+$/.test(q);
        const qre = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        
        if (isNumericSearch) {
          // For numeric searches, match admission exactly
          andClauses.push({ 'learner.admission': q });
        } else {
          // For text searches, use regex on both name and admission
          andClauses.push({ $or: [{ 'learner.name': { $regex: qre } }, { 'learner.admission': { $regex: qre } }] });
        }
      }
      if (andClauses.length) {
        pipeline.splice(3, 0, { $match: andClauses.length === 1 ? andClauses[0] : { $and: andClauses } });
      }
    }

    // continue building pipeline for grouping and pagination
    pipeline.push(
      { $group: {
          _id: '$learnerId',
          learner: { $first: '$learner' },
          assignmentIds: { $push: '$_id' },
          subjectArrays: { $push: { $concatArrays: [ { $ifNull: ['$subjects', []] }, { $ifNull: ['$electiveSet.subjects', []] } ] } },
          electiveSets: { $addToSet: '$electiveSet' },
          grade: { $first: '$grade' }
      }},
      { $project: {
          learner: 1,
          assignmentIds: 1,
          electiveSets: 1,
          grade: 1,
          mergedSubjects: { $reduce: { input: '$subjectArrays', initialValue: [], in: { $concatArrays: ['$$value', '$$this'] } } }
      }},
      { $project: {
          learner: 1,
          assignmentIds: 1,
          electiveSets: 1,
          grade: 1,
          subjectLines: { $setUnion: ['$mergedSubjects', []] }
      }},
      { $sort: { 'learner.name': 1 } },
      { $facet: {
        metadata: [{ $count: 'total' }],
        data: [{ $skip: (page - 1) * limit }, { $limit: limit }]
      }}
    );

    const agg = await LearnerElective.aggregate(pipeline);
    const metadata = (agg[0] && agg[0].metadata && agg[0].metadata[0]) ? agg[0].metadata[0] : { total: 0 };
    const data = (agg[0] && agg[0].data) ? agg[0].data : [];

    const total = metadata.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    return res.json({ data, page, limit, total, totalPages });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

// DELETE ASSIGNMENT
export const deleteAssignment = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await LearnerElective.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ message: "Assignment not found" });
    }

    return res.json({
      message: "Assignment removed successfully",
    });
  } catch (err) {
    console.error("deleteAssignment error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

/* =====================================================
   LEARNER ELECTIVES
===================================================== */

// GET ELECTIVES FOR ONE LEARNER
export const getLearnerElectives = async (req, res) => {
  try {
    const schoolId = req.user?.schoolId;
    const { learnerId } = req.params;

    const assignments = await LearnerElective.find({
      learnerId,
      schoolId,
    }).populate([
      { path: "electiveSetId", select: "name subjects grade" },
      { path: "learnerId", select: "name admission grade stream" }
    ]).sort({ createdAt: -1 });

    const learner = assignments?.[0]?.learnerId || null;
    const allElectives = assignments.flatMap((assignment) => {
      const fromSet = Array.isArray(assignment?.electiveSetId?.subjects)
        ? assignment.electiveSetId.subjects
        : [];
      const fromAssignment = Array.isArray(assignment?.subjects)
        ? assignment.subjects
        : [];
      return [...fromSet, ...fromAssignment];
    });

    return res.json({
      data: {
        learner,
        assignments,
        electives: Array.from(new Set(allElectives.filter(Boolean))),
        electiveSets: assignments.map((assignment) => assignment?.electiveSetId || null).filter(Boolean),
      },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET ASSIGNED LEARNER IDS (optionally filter by grade)
export const getAssignedLearnerIds = async (req, res) => {
  try {
    const schoolId = req.user?.schoolId;
    const grade = req.query.grade;
    if (!schoolId) return res.status(403).json({ message: 'Missing school context' });

    const query = { schoolId: new mongoose.Types.ObjectId(String(schoolId)) };
    if (grade) query.grade = String(grade);

    const rows = await LearnerElective.find(query).select('learnerId').lean();
    const ids = Array.from(new Set(rows.map(r => String(r.learnerId))));
    return res.json({ data: ids });
  } catch (err) {
    console.error('getAssignedLearnerIds error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};