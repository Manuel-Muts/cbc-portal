/**
 * Grading Service for CBC (Competency-Based Curriculum)
 * Handles both Junior School (1-9) and Senior School (10-12) assessment logic
 */

// ===== PERFORMANCE LEVEL CONSTANTS =====
const PERFORMANCE_LEVELS = {
  EE: { range: [80, 100], label: "Exceeding Expectations", descriptor: "Outstanding mastery" },
  ME: { range: [65, 79], label: "Meeting Expectations", descriptor: "Good mastery" },
  AE: { range: [50, 64], label: "Approaching Expectations", descriptor: "Partial mastery" },
  BE: { range: [0, 49], label: "Below Expectations", descriptor: "Needs support" }
};

// ===== COMPONENT WEIGHTS FOR SENIOR SCHOOL (Grade 10-12) =====
const SENIOR_SCHOOL_WEIGHTS = {
  continuousAssessment: 0.30, // 30%
  projectWork: 0.20,          // 20%
  endTermExam: 0.50           // 50%
};

/**
 * Convert numeric score to CBC Performance Level
 * @param {number} score - Score from 0-100
 * @returns {string} - Performance level code: EE, ME, AE, BE
 */
function scoreToPerformanceLevel(score) {
  if (score >= 80) return "EE";
  if (score >= 65) return "ME";
  if (score >= 50) return "AE";
  return "BE";
}

/**
 * Get detailed performance level info
 * @param {string} level - Performance level code
 * @returns {object} - Performance level details
 */
function getPerformanceLevelDetails(level) {
  return PERFORMANCE_LEVELS[level] || null;
}

/**
 * Calculate final score for Senior School (Grade 10-12)
 * Uses weighted average of three components
 * 
 * @param {number} continuousAssessment - Score 0-100 (30% weight)
 * @param {number} projectWork - Score 0-100 (20% weight)
 * @param {number} endTermExam - Score 0-100 (50% weight)
 * @returns {object} - { finalScore: number, performanceLevel: string }
 */
function calculateSeniorSchoolScore(continuousAssessment, projectWork, endTermExam) {
  // Validate inputs
  if (
    continuousAssessment === null || continuousAssessment === undefined ||
    projectWork === null || projectWork === undefined ||
    endTermExam === null || endTermExam === undefined
  ) {
    return null; // Cannot calculate if any component is missing
  }

  const ca = Number(continuousAssessment);
  const pw = Number(projectWork);
  const et = Number(endTermExam);

  // Validate ranges
  if (isNaN(ca) || isNaN(pw) || isNaN(et) ||
      ca < 0 || ca > 100 || pw < 0 || pw > 100 || et < 0 || et > 100) {
    return null; // Invalid scores
  }

  // Calculate weighted final score
  const finalScore = 
    (ca * SENIOR_SCHOOL_WEIGHTS.continuousAssessment) +
    (pw * SENIOR_SCHOOL_WEIGHTS.projectWork) +
    (et * SENIOR_SCHOOL_WEIGHTS.endTermExam);

  // Round to 1 decimal place
  const rounded = Math.round(finalScore * 10) / 10;

  return {
    finalScore: rounded,
    performanceLevel: scoreToPerformanceLevel(rounded),
    breakdown: {
      continuousAssessment: ca,
      projectWork: pw,
      endTermExam: et,
      weights: SENIOR_SCHOOL_WEIGHTS
    }
  };
}

/**
 * Analyze subject performance for senior school class
 * @param {array} marks - Array of mark documents
 * @returns {object} - Analysis of performance distribution
 */
function analyzeClassPerformance(marks) {
  if (!marks || marks.length === 0) return null;

  const analysis = {
    totalMarks: marks.length,
    performanceDistribution: {
      EE: 0,
      ME: 0,
      AE: 0,
      BE: 0
    },
    componentAverages: {
      continuousAssessment: 0,
      projectWork: 0,
      endTermExam: 0,
      finalScore: 0
    },
    componentWeakness: null
  };

  let caSum = 0, pwSum = 0, etSum = 0, fsSum = 0;
  let validCounts = { ca: 0, pw: 0, et: 0, fs: 0 };

  marks.forEach(mark => {
    // Count performance levels
    if (mark.performanceLevel) {
      analysis.performanceDistribution[mark.performanceLevel]++;
    }

    // Aggregate components
    if (mark.continuousAssessment !== null && mark.continuousAssessment !== undefined) {
      caSum += mark.continuousAssessment;
      validCounts.ca++;
    }
    if (mark.projectWork !== null && mark.projectWork !== undefined) {
      pwSum += mark.projectWork;
      validCounts.pw++;
    }
    if (mark.endTermExam !== null && mark.endTermExam !== undefined) {
      etSum += mark.endTermExam;
      validCounts.et++;
    }
    if (mark.finalScore !== null && mark.finalScore !== undefined) {
      fsSum += mark.finalScore;
      validCounts.fs++;
    }
  });

  // Calculate averages
  analysis.componentAverages.continuousAssessment = validCounts.ca > 0 ? 
    Math.round((caSum / validCounts.ca) * 10) / 10 : 0;
  analysis.componentAverages.projectWork = validCounts.pw > 0 ? 
    Math.round((pwSum / validCounts.pw) * 10) / 10 : 0;
  analysis.componentAverages.endTermExam = validCounts.et > 0 ? 
    Math.round((etSum / validCounts.et) * 10) / 10 : 0;
  analysis.componentAverages.finalScore = validCounts.fs > 0 ? 
    Math.round((fsSum / validCounts.fs) * 10) / 10 : 0;

  // Identify weakest component
  const componentAvgs = {
    continuousAssessment: analysis.componentAverages.continuousAssessment,
    projectWork: analysis.componentAverages.projectWork,
    endTermExam: analysis.componentAverages.endTermExam
  };

  const weakestComponent = Object.entries(componentAvgs).reduce((min, [key, val]) =>
    val < min.val ? { name: key, val } : min,
    { name: 'endTermExam', val: 100 }
  );

  // Generate interpretation
  analysis.componentWeakness = {
    weakestComponent: weakestComponent.name,
    score: weakestComponent.val,
    interpretation: generateWeaknessInterpretation(weakestComponent.name, weakestComponent.val)
  };

  // Calculate performance percentages
  Object.keys(analysis.performanceDistribution).forEach(level => {
    analysis.performanceDistribution[level + 'Percent'] = 
      Math.round((analysis.performanceDistribution[level] / marks.length) * 100);
  });

  return analysis;
}

/**
 * Generate interpretation text for component weakness
 * @param {string} component - Component name
 * @param {number} score - Component average score
 * @returns {string} - Interpretation text
 */
function generateWeaknessInterpretation(component, score) {
  const interpretations = {
    continuousAssessment: score < 65 ? 
      "Learners struggle with daily practice and formative assessments. Recommend: more practice sessions, peer tutoring." :
      "Learners show reasonable progress in continuous assessments.",
    projectWork: score < 65 ?
      "Learners find it challenging to apply concepts in practical tasks. Recommend: structured project guidance, worked examples." :
      "Learners demonstrate good practical application skills.",
    endTermExam: score < 65 ?
      "Learners are not performing well in summative exams. Recommend: exam technique training, more revision time, past papers." :
      "Learners perform adequately in formal examinations."
  };
  return interpretations[component] || "Review teaching strategies";
}

/**
 * Generate teacher comment based on performance and components
 * @param {number} finalScore - Final weighted score
 * @param {string} performanceLevel - Performance level
 * @param {object} components - { continuousAssessment, projectWork, endTermExam }
 * @param {string} courseName - Course/subject name
 * @returns {string} - Tailored teacher comment
 */
function generateTeacherComment(finalScore, performanceLevel, components, courseName = "") {
  const courseRef = courseName ? ` in ${courseName}` : "";
  let comment = "";

  if (performanceLevel === "EE") {
    comment = `Excellent performance${courseRef}. Keep maintaining this outstanding work!`;
  } else if (performanceLevel === "ME") {
    const weakComponent = Object.entries(components).reduce((min, [k, v]) =>
      v < min.val ? { name: k, val: v } : min,
      { name: 'endTermExam', val: 100 }
    );
    
    if (weakComponent.name === 'endTermExam' && weakComponent.val < 65) {
      comment = `Good continuous progress${courseRef}, but exam performance needs attention. Focus on revision techniques.`;
    } else if (weakComponent.name === 'projectWork' && weakComponent.val < 65) {
      comment = `Solid theory knowledge${courseRef}, but practical application needs strengthening. Engage more with projects.`;
    } else {
      comment = `Good overall performance${courseRef}. Continue with consistent effort.`;
    }
  } else if (performanceLevel === "AE") {
    const strongComponent = Object.entries(components).reduce((max, [k, v]) =>
      v > max.val ? { name: k, val: v } : max,
      { name: 'projectWork', val: 0 }
    );
    
    if (strongComponent.name === 'projectWork' && strongComponent.val >= 75) {
      comment = `Shows creativity${courseRef}. Strengthen conceptual understanding through more theory practice.`;
    } else {
      comment = `Approaching expected level${courseRef}. Needs more focused effort on weak areas.`;
    }
  } else { // BE
    comment = `Below expected level${courseRef}. Requires immediate intervention and targeted support.`;
  }

  return comment;
}

/**
 * Track student progress across terms (Grade 10-12)
 * @param {array} allMarksByTerm - Array of marks grouped by term
 * @param {string} courseName - Course name
 * @returns {object} - Progress trend
 */
function trackProgressTrend(allMarksByTerm, courseName) {
  if (!allMarksByTerm || allMarksByTerm.length === 0) return null;

  const trend = {
    course: courseName,
    termProgression: [],
    overall: {
      trend: null,
      improvement: 0,
      consistency: null
    }
  };

  const scores = [];

  allMarksByTerm.forEach(termData => {
    if (termData.finalScore) {
      trend.termProgression.push({
        term: termData.term || "Unknown",
        score: termData.finalScore,
        level: termData.performanceLevel
      });
      scores.push(termData.finalScore);
    }
  });

  if (scores.length >= 2) {
    const improvement = scores[scores.length - 1] - scores[0];
    trend.overall.improvement = Math.round(improvement * 10) / 10;
    trend.overall.trend = improvement > 5 ? "Improving" : improvement < -5 ? "Declining" : "Stable";
    
    // Calculate consistency (standard deviation)
    const mean = scores.reduce((a, b) => a + b) / scores.length;
    const variance = scores.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    trend.overall.consistency = stdDev < 10 ? "Consistent" : "Variable";
  }

  return trend;
}

export {
  scoreToPerformanceLevel,
  getPerformanceLevelDetails,
  calculateSeniorSchoolScore,
  analyzeClassPerformance,
  generateTeacherComment,
  trackProgressTrend,
  generateWeaknessInterpretation,
  PERFORMANCE_LEVELS,
  SENIOR_SCHOOL_WEIGHTS
};
