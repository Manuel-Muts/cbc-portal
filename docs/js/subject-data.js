window.SUBJECT_DATA = window.SUBJECT_DATA || {};

window.SUBJECT_DATA.gradeSubjects = {
  "1-3": [
    "Mathematics",
    "Kiswahili",
    "English",
    "Environmental Activities",
    "Social Studies",
    "Christian Religious Studies (CRE)",
    "Creative Arts and Sports"
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
    "Creative Arts and Sports"
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
    "History & Citizenship",
    "Geography",
    "Christian Religious Studies (CRE)",
    "Business Studies",
    "Computer Science",
    "Computer Studies",
    "Home Science",
    "Political Studies",
    "Kenya Sign Language",
    "Literature in English",
    "Fasihi ya Kiswahili",
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
    "Sports and Recreation"
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
    "Literature in English",
    "Fasihi ya Kiswahili",
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
    "Literature in English",
    "Islamic Religious Education",
    "German",
    "Fasihi ya Kiswahili",
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
  technical: [
    "Mathematics",
    "English",
    "Kiswahili",
    "Integrated Science",
    "Physics",
    "Chemistry",
    "Biology",
    "Environmental Activities",
    "Pre-Technical Studies",
    "Computer Studies",
    "General Science"
  ],
  activity: [
    "PE",
    "Sports and Recreation",
    "Music and Dance"
  ],
  lowLoad: [
    "Creative Arts and Sports",
    "Creative Arts",
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
  if (window.SUBJECT_DATA?.subjectCategories?.technical?.some(t => name.includes(t))) return "TECHNICAL";
  if (window.SUBJECT_DATA?.subjectCategories?.activity?.some(a => name.includes(a))) return "ACTIVITY";
  if (window.SUBJECT_DATA?.subjectCategories?.lowLoad?.some(l => name.includes(l))) return "CREATIVE";
  return "STANDARD";
};

window.SUBJECT_DATA.getDefaultFrequency = function(sub) {
  if (sub === "PPI") return 1;
  const type = window.SUBJECT_DATA.getSubjectType(sub);
  return (type === "TECHNICAL") ? 5 : 3;
};

window.SUBJECT_DATA.getGradeSubjects = function() {
  return this.gradeSubjects;
};
