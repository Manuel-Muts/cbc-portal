window.SUBJECT_DATA = window.SUBJECT_DATA || {};

window.SUBJECT_DATA.gradeSubjects = {
  "PG-PP2": [
    "Language",
    "Numberwork",
    "Environmental Activities",
    "Psychomotor",
    "Literacy",
    "Kiswahili",
    "Creative Arts",
   "Christian Religious Education",
    "English",
    "Mathematics",
   
  ],
  "1-3": [
    "Mathematics",
    "Kiswahili",
    "English",
    "ILA",
    "Environmental Activities",
    "Social Studies",
    "Christian Religious Education",
    "Creative Arts and Sports",
    "Sports C/A(s)",
    "Visual Arts C/A(v)",
    "Performing Arts C/A(p)"
  ],
  "4-6": [
    "Mathematics",
    "English",
    "Kiswahili",
    "Science and Technology",
    "Integrated Science",
    "Social Studies",
    "Christian Religious Education",
    "Creative Arts and Sports",
    "Sports C/A(s)",
    "Visual Arts C/A(v)",
    "Performing Arts C/A(p)",
    "Physical Health Education"
  ],
  "7-9": [
    "Mathematics",
    "English",
    "Kiswahili",
    "Integrated Science",
    "Agriculture",
     "Christian Religious Education",
    "Health Education",
    "Pre-Technical Studies",
    "Sports and Physical Education",
    "Creative Arts and Sports",
    "Sports C/A(s)",
    "Visual Arts C/A(v)",
    "Performing Arts C/A(p)",
     "Business Studies",
     "Social Studies",
  ],
  "10-12": [
    "Mathematics",
    "English",
    "Kiswahili",
    "ICT",
    "Physics",
    "Chemistry",
    "Biology",
    "History",
    "Geography",
    "History & Citizenship",
    "Geography",
     "Christian Religious Education",
    "Business Studies",
    "Computer Science",
    "Computer Studies",
    "Home Science",
    "Political Studies",
    "Kenya Sign Language",
    "Literature",
    "Fasihi",
    "Indigenous Language",
    "Hindu Religious Education",
    "French",
    "German",
    "Islamic Religious Education",
    "Environmental Science",
    "Engineering Technology",
    "Applied Sciences",
    "Electricity",
    "Aviation",
    "Agriculture",
    "Marine and Fisheries",
    "Building and Construction",
    "Woodwork",
    "Metalwork",
    "Power Mechanics",
    "General Science",
    "Media Technology",
    "Fine Art",
    "Film & Media Studies",
    "Fashion & Design",
    "Music and Dance",
    "Theatre and Film",
    "Sports and Recreation",
    "Community Service Learning",
    "Physical Health Education"
  ]
};

/**
 * 🆕 Centered Logic for Senior School Compulsory Subjects
 */
window.SUBJECT_DATA.seniorCompulsorySubjects = [
  "English",
  "Kiswahili",
  "Mathematics",
  "PE",
  "ICT",
  "CSL"
];

window.SUBJECT_DATA.seniorSchoolPathways = {
  STEM: [
    "Physics",
    "Chemistry",
    "Biology",
    "Agriculture",
    "Computer Studies",
    "Home Science",
    "Electricity",
    "Environmental Science",
    "Engineering Technology",
    "Applied Sciences",
    "Aviation",
    "Marine and Fisheries",
    "Building and Construction",
    "Woodwork",
    "Metalwork",
    "Power Mechanics",
    "General Science",
    "Media Technology",
     "Business Studies",
  ],
  "Social Sciences": [
    "Geography",
    "History",
    "Business Studies",
    "Literature",
    "Fasihi",
    "Christian Religious Education",
    "Political Studies",
    "Kenya Sign Language",
    "History & Citizenship",
    "Indigenous Language",
    "Hindu Religious Education",
    "French",
    "German",
    "Islamic Religious Education"
  ],
  "Arts & Sports Science": [
    "French",
    "Hindu Religious Education",
    "Computer Studies",
    "Literature",
    "Islamic Religious Education",
    "German",
    "Fasihi",
    "Kiswahili",
    "History & Citizenship",
    "Geography",
    "Biology",
    "General Science",
    "Fine Art",
    "Film & Media Studies",
    "Fashion & Design",
    "Music and Dance",
    "Theatre and Film",
    "Sports and Recreation"
  ]
};

window.SUBJECT_DATA.subjectCategories = {
  core: [
    "Mathematics",
    "English",
    "Kiswahili",
    "Numberwork",
    "Psychomotor",
    "Literacy"
   
  ],
  technical: [
    "Integrated Science",
    "Science and Technology",
    "Pre-Technical Studies",
    "Physics",
    "Chemistry",
    "Biology",
    "Environmental Activities",
    "Pre-Technical Studies",
    "Computer Studies",
    "ICT",
  ],
  activity: [
    "Sports and Recreation",
    "Music and Dance"
  ],
  lowLoad: [
    "Creative Arts and Sports",
    "Sports C/A(s)",
    "Visual Arts C/A(v)",
    "Performing Arts C/A(p)",
    "Life Skills",
    "Fine Art",
    "Theatre and Film",
    "PPI"
  ]
};

window.SUBJECT_DATA.defaultActivityPeriods = [
  "CLUBS & SOCIETIES",
  "GAMES & SPORTS",
  "GUIDANCE & COUNSELING",
  "CAREER & GUIDANCE"
];

window.SUBJECT_DATA.getSubjectType = function(sub) {
  const name = (sub || "").trim();
  if (window.SUBJECT_DATA?.subjectCategories?.core?.some(c => name.includes(c))) return "CORE";
  if (window.SUBJECT_DATA?.subjectCategories?.technical?.some(t => name.includes(t))) return "TECHNICAL";
  if (window.SUBJECT_DATA?.subjectCategories?.activity?.some(a => name.includes(a))) return "ACTIVITY";
  if (window.SUBJECT_DATA?.subjectCategories?.lowLoad?.some(l => name.includes(l))) return "CREATIVE";
  return "STANDARD";
};

window.SUBJECT_DATA.getDefaultFrequency = function(sub, grade) {
 const name = (sub || "").trim();
  if (name === "PPI") {
    if (!grade || grade === "all") return 1; 
    const match = String(grade).match(/\d+/);
    const num = match ? parseInt(match[0]) : 0;
    if (num >= 7) return 0; // Grades 7, 8, 9, 10, 11, 12 default to 0
    return 1; // Primary (1-6)
  }
  // Components typically have 1-2 lessons per week
  if (name === "Creative Arts and Sports") return 0;
  if (name === "Sports C/A(s)") return 2;
  if (name === "Visual Arts C/A(v)") return 1;
  if (name === "Performing Arts C/A(p)") return 2;
  if (name.includes("C/A(")) return 1;
  if (name === "Agriculture" || name === "Pre-Technical Studies") return 4;
  if (name === "Christian Religious Studies" || name === "Christian Religious Education" || name === "Social Studies") return 4;
  if (name === "Kiswahili") return 4;
  const type = window.SUBJECT_DATA.getSubjectType(sub);
  if (type === "CORE") return 5;
  if (type === "TECHNICAL") return 5;
  return 3;
};

/**
 * 🆕 Maps timetable-specific subdivisions to their parent Mark Entry subjects.
 * Prevents scheduling components from cluttering the marks entry table.
 */
window.SUBJECT_DATA.getMarkEntrySubject = function(sub) {
  const name = (sub || "").trim();
  
  // Define subdivisions that should roll up into "Creative Arts and Sports"
  const creativeArtsSubdivisions = [
    "Sports C/A(s)",
    "Visual Arts C/A(v)",
    "Performing Arts C/A(p)",
    "Sports and Physical Education",
    "Physical Health Education"
  ];

  if (creativeArtsSubdivisions.includes(name) || name.includes("C/A(")) {
    return "Creative Arts and Sports";
  }

  return sub;
};

/**
 * 🆕 Centered helper to determine the pathway for a Senior School subject.
 * Prioritizes Compulsory subjects as "Core".
 */
window.SUBJECT_DATA.getSeniorPathway = function(subjectName) {
  const sub = (subjectName || "").trim();
  
  const isCompulsory = this.seniorCompulsorySubjects.some(s => s.toLowerCase() === sub.toLowerCase());
  if (isCompulsory) return "Core";

  for (const [pathway, subjects] of Object.entries(this.seniorSchoolPathways)) {
    if (subjects.some(s => s.toLowerCase() === sub.toLowerCase())) {
      return pathway;
    }
  }
  return null;
};

/**
 * 🆕 Returns a list of subjects that are electives for a given Senior School pathway.
 * Electives are subjects within the pathway that are NOT in the seniorCompulsorySubjects list.
 * @param {string} pathway - The name of the Senior School pathway (e.g., "STEM").
 * @returns {string[]} An array of elective subject names.
 */
window.SUBJECT_DATA.getElectiveSubjectsForPathway = function(pathway) {
  const pathwaySubjects = this.seniorSchoolPathways[pathway];
  if (!pathwaySubjects) return [];
  
  const compulsoryLower = this.seniorCompulsorySubjects.map(s => s.toLowerCase());
  
  return pathwaySubjects.filter(sub => !compulsoryLower.includes(sub.toLowerCase()));
};

/**
 * 🆕 Validates if a Senior School student's subject selection meets the elective criteria.
 * - Requires exactly 3 elective subjects.
 * - All elective subjects must belong to the specified pathway.
 * @param {string} studentPathway - The student's declared Senior School pathway.
 * @param {string[]} allSubmittedCourses - An array of all course names submitted for the student in an assessment.
 * @returns {string[]} An array of error messages, or an empty array if validation passes.
 */
window.SUBJECT_DATA.validateSeniorElectiveSelection = function(studentPathway, allSubmittedCourses) {
  const errors = [];
  if (!studentPathway) {
    errors.push("Student pathway is not defined.");
    return errors;
  }

  const compulsorySubjectsLower = this.seniorCompulsorySubjects.map(s => s.toLowerCase());
  const pathwayElectivesLower = this.getElectiveSubjectsForPathway(studentPathway).map(s => s.toLowerCase());

  const submittedCompulsory = new Set();
  const submittedElectives = new Set();
  const submittedOther = new Set(); // Subjects not recognized or not in pathway

  allSubmittedCourses.forEach(course => {
    const courseLower = course.toLowerCase();
    if (compulsorySubjectsLower.includes(courseLower)) {
      submittedCompulsory.add(course);
    } else if (pathwayElectivesLower.includes(courseLower)) {
      submittedElectives.add(course);
    } else {
      submittedOther.add(course);
    }
  });

  if (submittedElectives.size !== 3) {
    errors.push(`Learner must select exactly 3 elective subjects from their pathway. Currently selected: ${submittedElectives.size}`);
  }

  if (submittedOther.size > 0) {
    errors.push(`Some subjects are not part of the compulsory list or the '${studentPathway}' pathway: ${Array.from(submittedOther).join(', ')}`);
  }

  return errors;
};

window.SUBJECT_DATA.getGradeSubjects = function() {
  return this.gradeSubjects;
};
