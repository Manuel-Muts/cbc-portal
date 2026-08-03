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
    "Agriculture",
    "Christian Religious Education",
    "Business Studies",
    "Literature",
    "Fasihi",
    "Computer Science",
    "Electricity",
    "Computer Studies",
    "Sports",
    "History & Citizenship",
    "Computer Studies",
    "Home Science",
    "Political Studies",
    "Kenya Sign Language",
    "Indigenous Language",
    "Hindu Religious Education",
    "French",
    "German",
    "Islamic Religious Education",
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

window.SUBJECT_DATA.seniorPathwayOverrides = {
  Biology: "STEM",
  Chemistry: "STEM",
  Physics: "STEM",
  Agriculture: "STEM",
  "Computer Studies": "STEM",
  "Home Science": "STEM",
  Electricity: "STEM",
  "Environmental Science": "STEM",
  "Engineering Technology": "STEM",
  "Applied Sciences": "STEM",
  Aviation: "STEM",
  "Marine and Fisheries": "STEM",
  "Building and Construction": "STEM",
  Woodwork: "STEM",
  Metalwork: "STEM",
  "Power Mechanics": "STEM",
  "General Science": "STEM",
  "Media Technology": "STEM"
};

window.SUBJECT_DATA.seniorSchoolPathways = {
  STEM: [
    "Physics",
    "Chemistry",
    "Biology",
    "Agriculture",
    "Computer Studies",
    "Home Science",
    "Electricity",
    "Engineering Technology",
    "Environmental Science",
    "Applied Sciences",
    "Aviation",
    "Marine and Fisheries",
    "Building and Construction",
    "Woodwork",
    "Metalwork",
    "Power Mechanics",
  
   
   
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
  const normalized = name.toLowerCase();
  const gradeMatch = String(grade || "").match(/\d+/);
  const gradeNum = gradeMatch ? parseInt(gradeMatch[0], 10) : 0;
  const isSeniorGrade = typeof window.cbcUtils?.isSeniorGrade === 'function'
    ? window.cbcUtils.isSeniorGrade(grade)
    : gradeNum >= 10;
  const isGradesOneToThree = gradeNum >= 1 && gradeNum <= 3;

  if (name === "PPI") {
    if (!grade || grade === "all") return 1;
    const match = String(grade).match(/\d+/);
    const num = match ? parseInt(match[0]) : 0;
    if (num >= 7) return 0; // Grades 7, 8, 9, 10, 11, 12 default to 0
    return 1; // Primary (1-6)
  }

  if (isGradesOneToThree && name === "ILA") return 0;
  if (isGradesOneToThree && name === "Environmental Activities") return 5;
  if (isGradesOneToThree && name === "Christian Religious Education") return 3;
  if (isGradesOneToThree && name === "Creative Arts and Sports") return 5;

  if (isSeniorGrade) {
    const seniorSpecificFrequencies = {
      mathematics: 6,
      math: 6,
      maths: 6,
      csl: 3,
      "community service learning": 3,
      pe: 2,
      "physical education": 2,
      "sports and physical education": 2,
      "physical health education": 2,
      "sports and recreation": 3,
      biology: 5,
      chemistry: 5,
      physics: 5,
      "computer studies": 5,
      electricity: 5,
      english: 5,
      kiswahili: 5,
      "christian religious education": 5,
      history: 5,
      geography: 5,
      agriculture: 3,
      "business studies": 3,
      literature: 5,
      fasihi: 5
    };

    if (seniorSpecificFrequencies[normalized] !== undefined) return seniorSpecificFrequencies[normalized];
  }

  // Components typically have 1-2 lessons per week
  if (name === "Creative Arts and Sports") return 0;
  if (name === "Sports C/A(s)") return 2;

  if (name === "Visual Arts C/A(v)") return 1;
  if (name === "Performing Arts C/A(p)") return 2;
  if (name.includes("C/A(")) return 1;
  if (name === "Agriculture" || name === "Pre-Technical Studies") return 4;
  if (name === "Christian Religious Education" || name === "Social Studies") return 4;
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
window.SUBJECT_DATA.normalizeSeniorSubjectName = function(subject) {
  const name = String(subject || "").trim();
  const normalized = name.toLowerCase();
  const aliases = {
    "bio": "Biology",
    "bio b/s": "Biology",
    "biology": "Biology",
     "physics": "Physics",
    "phy":"Physics",
    "geo": "Geography",
    "geography": "Geography",
    "hist": "History",
    "history": "History",
    "chem": "Chemistry",
    "chemistry": "Chemistry",
    "computer science": "Computer Studies",
    "cs": "Computer Studies",
    "computer studies": "Computer Studies",
    "community service learning": "CSL",
    "csl": "CSL",
    "business": "Business Studies",
    "business studies": "Business Studies",
    "cre": "Christian Religious Education",
    "christian religious education": "Christian Religious Education",
    "christian religious studies": "Christian Religious Education",
    "religious education": "Christian Religious Education",
    "history & citizenship": "History & Citizenship",
    "history and citizenship": "History & Citizenship",
    "english": "English",
    "english language": "English",
    "math": "Mathematics",
    "maths": "Mathematics",
    "mathematics": "Mathematics",
    "kiswahili": "Kiswahili",
    "kiswahili language": "Kiswahili",
    "physical education": "PE",
    "phys ed": "PE",
    "pe": "PE",
    "ict": "ICT",
    "information communication technology": "ICT",
    "information and communication technology": "ICT"
  };
  return aliases[normalized] || name;
};

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

  return this.normalizeSeniorSubjectName(name);
};

window.SUBJECT_DATA.isSeniorNonGradedMarkSubject = function(subjectName, grade) {
  const normalized = this.normalizeSeniorSubjectName(subjectName);
  if (!normalized) return false;

  const gradeMatch = String(grade || "").match(/\d+/);
  const gradeNumber = gradeMatch ? parseInt(gradeMatch[0], 10) : 0;
  const isSeniorGrade = gradeNumber >= 10 && gradeNumber <= 12;
  const nonGradedSubjects = ["PE", "ICT"];

  return isSeniorGrade && nonGradedSubjects.includes(normalized);
};

/**
 * 🆕 Centered helper to determine the pathway for a Senior School subject.
 * Prioritizes Compulsory subjects as "Core".
 */
window.SUBJECT_DATA.getSeniorPathway = function(subjectName) {
  const sub = this.normalizeSeniorSubjectName(subjectName);
  
  const isCompulsory = this.seniorCompulsorySubjects.some(s => s.toLowerCase() === sub.toLowerCase());
  if (isCompulsory) return "Core";

  const override = this.seniorPathwayOverrides?.[sub];
  if (override) return override;

  for (const [pathway, subjects] of Object.entries(this.seniorSchoolPathways)) {
    if (subjects.some(s => s.toLowerCase() === sub.toLowerCase())) {
      return pathway;
    }
  }
  return null;
};

window.SUBJECT_DATA.getSeniorPathwaysForSubject = function(subjectName) {
  const sub = this.normalizeSeniorSubjectName(subjectName);
  if (!sub) return [];

  if (this.seniorCompulsorySubjects.some(s => s.toLowerCase() === sub.toLowerCase())) {
    return ["Core"];
  }

  const override = this.seniorPathwayOverrides?.[sub];
  if (override) return [override];

  const matchedPathways = [];
  for (const [pathway, subjects] of Object.entries(this.seniorSchoolPathways)) {
    if (subjects.some(s => this.normalizeSeniorSubjectName(s).toLowerCase() === sub.toLowerCase())) {
      matchedPathways.push(pathway);
    }
  }
  return matchedPathways;
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
  const normalizedSubjects = pathwaySubjects.map(sub => this.normalizeSeniorSubjectName(sub));
  
  return normalizedSubjects.filter(sub => !compulsoryLower.includes(sub.toLowerCase()));
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
  const submittedCourses = (allSubmittedCourses || []).map(course => this.normalizeSeniorSubjectName(course));
  const submittedElectives = new Set(submittedCourses.filter(course => pathwayElectivesLower.includes(course.toLowerCase())));
  const submittedOther = new Set(submittedCourses.filter(course => !compulsorySubjectsLower.includes(course.toLowerCase()) && !pathwayElectivesLower.includes(course.toLowerCase())));
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
