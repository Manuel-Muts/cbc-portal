const DEFAULT_CONTEXT = {
  pageName: 'CompetenceHub',
  activeTab: ''
};

function normalize(text) {
  return String(text || '').toLowerCase().trim();
}

function getPageGuide(pageName, activeTab) {
  const page = String(pageName || '').toLowerCase();
  const tab = String(activeTab || '').toLowerCase();

  if (page.includes('dean') || page.includes('dean dashboard')) {
    if (tab.includes('rank')) return 'The Learner Rankings tab is best for ranked performance tables and detailed review.';
    if (tab.includes('school')) return 'The School Rankings tab gives a school-wide view after you choose the grade, term, assessment, and year.';
    if (tab.includes('submitted')) return 'The Submitted Subjects tab helps you audit which subjects already have marks entered.';
    if (tab.includes('marks')) return 'The Learner Marks tab lets you add a missing mark for a learner when one is absent.';
    if (tab.includes('report')) return 'The Learners Reports tab is the place to prepare and print learner-facing reports.';
    if (tab.includes('timetable')) return 'The Timetable module opens a dedicated scheduling view for timetable management.';
    if (tab.includes('sms')) return 'The SMS Results section is for communication and result delivery workflows.';
    return 'The overview and filters let you explore performance summaries before switching to more specific modules.';
  }

  if (page.includes('competencehub') || page.includes('home')) {
    return 'On the home page, you can learn about the platform, its features, and how to get started with login and access.';
  }

  if (page.includes('login')) {
    return 'On the login page, you can sign in with your school account and continue to the correct dashboard for your role.';
  }

  return 'This portal is designed to support learners, teachers, administrators, and school leaders with academic and administrative workflows.';
}

function getAssistantReply(message, context = {}) {
  const text = normalize(message);
  const merged = { ...DEFAULT_CONTEXT, ...context };
  const pageName = merged.pageName || DEFAULT_CONTEXT.pageName;
  const activeTab = String(merged.activeTab || '').toLowerCase();

  if (!text) {
    return `Hello! I can explain how ${pageName} works and guide you through its main modules. Ask me things like “What can I do here?” or “How do I generate reports?”`;
  }

  if (/(what can i do|what can you do|help|guide|overview)/i.test(message)) {
    return `You can use ${pageName} to learn about the system, navigate the main modules, and understand the portal's key workflows. ${getPageGuide(pageName, activeTab)} If you are on the dean view, start by choosing a grade, term, assessment, and year.`;
  }

  if (/(report|reports|ranking|rankings|print pdf|print)/i.test(text)) {
    return `For reports and rankings, select the grade, term, assessment, and year first. Then use the Learner Rankings tab for detailed ranking tables, or the Learners Reports tab to prepare report-ready outputs. The system also supports PDF printing for subject and missing-exam reports.`;
  }

  if (/(teacher|teachers)/i.test(text)) {
    return `Teachers use this portal to manage marks, subjects, materials, and reporting tasks. They can review learner performance, update assessment information, and support day-to-day academic workflows.`;
  }

  if (/(learner|learners|student|students)/i.test(text)) {
    return `Learners use the portal to view progress, access learning resources, and stay informed about marks and school updates. The experience is designed to make academic information easier to follow.`;
  }

  if (/(what is this system|what is this platform|what is this portal)/i.test(text)) {
    return `This is the CBE school portal, a role-based academic and administration system for learners, teachers, admins, and school leaders. It centralizes records, reports, marks, and school operations in one place.`;
  }

  if (/(feature|features|what features does it offer|what does it offer|offerings)/i.test(text)) {
    return `It offers learner performance tracking, marks management, subject review, reporting tools, timetables, finance workflows, and communication features so school teams can work from a single system.`;
  }

  if (/(home page|homepage|landing page|get started|start)/i.test(text)) {
    return `The home page introduces the system and helps visitors understand the platform’s purpose. From there, users can move to login and access the role-based dashboards.`;
  }

  if (/(contact|contacts|reach|support|call|email|phone|address|location|office)/i.test(text)) {
    return `You can contact the portal support team through the contact page. The available details are <span class="system-assistant-contact-pill"><a href="tel:+254717747895" target="_blank" rel="noopener noreferrer">+254 717 747 895</a></span> and <span class="system-assistant-contact-pill"><a href="mailto:cbcportal71@gmail.com">cbcportal71@gmail.com</a></span> for support, inquiries, or logo design requests.`;
  }

  if (/(founder|who founded|who is the founder|creator|ceo|emmanuel mutegi|muts tech)/i.test(text)) {
    return `The founder of CompetenceHub is Emmanuel Mutegi, the Founder & CEO of Muts Tech. He is described as a visionary who built the platform to transform education through technology and data-driven decision-making.`;
  }

  if (/(role|roles|admin|parent|dean)/i.test(text)) {
    return `The system is built for different user roles. Teachers can manage marks and materials, learners and parents can view progress and learning resources, and admins or deans can oversee school-wide reporting and operations.`;
  }

  if (/(finance|payment|fees|accounts)/i.test(text)) {
    return `The portal includes financial and accounts workflows for fee handling, payments, and school administration, depending on the role and module access.`;
  }

  if (/(grading|configure grading|grade scale|grade range)/i.test(text)) {
    return `You can configure grading ranges from the Configure Grading button in the sidebar. That lets you define the labels, ranges, and points used by the system for performance interpretation. After saving, the dashboard can refresh its analysis using the updated scale.`;
  }

  if (/(subject|subjects|submitted)/i.test(text)) {
    return `The Submitted Subjects module is designed to audit which teaching subjects already have marks entered. It is especially useful when you want to confirm completion before generating reports or reviewing learner outcomes.`;
  }

  if (/(mark|marks|missing mark|enter mark)/i.test(text)) {
    return `Use the Learner Marks tab to search for a learner and add a missing mark when a mark has not been entered. This helps keep the report data complete and consistent.`;
  }

  if (/(sms|message|broadcast)/i.test(text)) {
    return `The SMS Results area is where the system handles communication and result distribution workflows. It is useful when you need to send information to selected learners or groups.`;
  }

  if (/(timetable|calendar|schedule)/i.test(text)) {
    return `The timetable module is a dedicated section for timetable related work. It opens as a focused view so you can manage schedules without losing the rest of the dashboard context.`;
  }

  if (/(filter|term|assessment|year|stream|pathway)/i.test(text)) {
    return `The filter bar is the starting point for most analysis. Choose the grade, term, assessment, year, and stream first so the dashboard can show the correct learner data and ranking results.`;
  }

  if (/(who are you|your name|assistant|chatbot)/i.test(text)) {
    return `I am the CBC System Assistant. I can explain how this portal is organized, guide you through reports, marks, subjects, grading, navigation, and general system information across the different modules.`;
  }

  if (/(login|logout|session|account)/i.test(text)) {
    return `Use the sidebar actions to log out when you are done. For day-to-day work, the dashboard is designed to stay open so you can move between modules without interrupting your flow.`;
  }

  if (/(school|learner|student)/i.test(text)) {
    return `This system is built around learner records, subject performance, and school administration workflows. The dean view helps you inspect class results, rankings, and related reports in one place.`;
  }

  return `I can help explain the portal and its main modules across the system. Try asking about the home page, login, reports, rankings, grading, submitted subjects, marks, SMS, timetables, roles, or general platform features. ${getPageGuide(pageName, activeTab)}`;
}

export { getAssistantReply };
