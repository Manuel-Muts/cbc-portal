window.SUBJECT_DATA = window.SUBJECT_DATA || {};

window.SUBJECT_DATA.gradeSubjects = {
  "PG-PP2": [
    "Language",
    "Numberwork",
    "Environmental Activities",
    "Psychomotor",
    "Literacy",
    "Kswahili",
    "English",
    "Mathematics",
    "Creative Arts",
    "Christian Religious Studies (CRE)"
  ],
  "1-3": [
    "Mathematics",
    "Kiswahili",
    "English",
    "ILA",
    "Environmental Activities",
    "Social Studies",
    "Christian Religious Studies (CRE)",
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
    "Christian Religious Studies (CRE)",
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
    "Business Studies",
    "Agriculture",
    "Social Studies",
    "Christian Religious Studies (CRE)",
    "Health Education",
    "Pre-Technical Studies",
    "Sports and Physical Education",
    "Creative Arts and Sports",
    "Sports C/A(s)",
    "Visual Arts C/A(v)",
    "Performing Arts C/A(p)"
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
    "Christian Religious Studies (CRE)",
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
    "Community service Learning",
  ]
};

window.SUBJECT_DATA.seniorSchoolPathways = {
  STEM: [
    "Mathematics",
    "Biology",
    "Chemistry",
    "Physics",
    "Business Studies",
    "Computer Studies",
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
    "Home Science",
    "Media Technology"
  ],
  "Social Sciences": [
    "History & Citizenship",
    "Geography",
    "Mathematics",
    "Business Studies",
    "Political Studies",
    "Christian Religious Studies (CRE)",
    "Kenya Sign Language",
    "Literature",
    "Fasihi",
    "Indigenous Language",
    "Hindu Religious Education",
    "French",
    "German",
    "Islamic Religious Education"
  ],
  "Arts & Sports Science": [
    "French",
    "Hindu Religious Education",
    "Mathematics",
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
    "General Science"
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
  if (name === "Christian Religious Studies (CRE)" || name === "Christian Religious Education" || name === "Social Studies") return 4;
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

window.SUBJECT_DATA.getGradeSubjects = function() {
  return this.gradeSubjects;
};
