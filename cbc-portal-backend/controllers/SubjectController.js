// controllers/SubjectController.js

// ===============================
// SENIOR SCHOOL STRUCTURE; This is for allocations and subject management. 
// It is not stored in the DB since it's static and universal across all schools.
// ===============================

const SENIOR_COMPULSORY_SUBJECTS = [
  "English",
  "Kiswahili",
  "Mathematics",
  "PE",
  "ICT",
  "CSL"
];

const SENIOR_SCHOOL_PATHWAYS = {
  STEM: [
    "Biology", "Chemistry", "Physics", "Business Studies", "Computer Studies",
    "Environmental Science", "Engineering Technology", "Applied Sciences",
    "Electricity", "Aviation", "Agriculture", "Marine and Fisheries",
    "Building and Construction", "Woodwork", "Metalwork", "Power Mechanics",
    "General Science", "Home Science", "Media Technology"
  ],
  "Social Sciences": [
    "History & Citizenship", "History", "Geography", "Business Studies", "Political Studies",
    "Christian Religious Studies (CRE)", "Kenya Sign Language", "Literature",
    "Fasihi", "Indigenous Language", "Hindu Religious Education", "French",
    "German", "Islamic Religious Education"
  ],
  "Arts & Sports Science": [
    "French", "Hindu Religious Education", "Computer Studies", "Literature",
    "Islamic Religious Education", "German", "Fasihi", "Kiswahili",
    "History & Citizenship", "Geography", "Biology", "General Science",
    "Fine Art", "Film & Media Studies", "Fashion & Design", "Music and Dance",
    "Theatre and Film", "Sports and Recreation"
  ]
};

/* =====================================================
   GET ALL SUBJECTS (FLAT LIST FOR FRONTEND)
===================================================== */
export const getSubjects = async (req, res) => {
  try {
    const { type } = req.query;

    // compulsory only
    if (type === "compulsory") {
      return res.json({
        data: SENIOR_COMPULSORY_SUBJECTS.map((s) => ({
          name: s,
          type: "compulsory"
        }))
      });
    }

    // electives only (all pathways merged)
    if (type === "elective") {
      const electives = [];

      Object.entries(SENIOR_SCHOOL_PATHWAYS).forEach(([pathway, subjects]) => {
        subjects.forEach((subj) => {
          electives.push({
            name: subj,
            pathway,
            type: "elective"
          });
        });
      });

      return res.json({ data: electives });
    }

    // default → full structure (best for admin UI)
    return res.json({
      data: {
        compulsory: SENIOR_COMPULSORY_SUBJECTS,
        pathways: SENIOR_SCHOOL_PATHWAYS
      }
    });
  } catch (err) {
    console.error("getSubjects error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};