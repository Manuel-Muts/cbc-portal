import { getCurrentDashboardSummaryForSchool } from '../services/dashboardSummaryService.js';

export const getDashboardSummary = async (req, res) => {
  try {
    const schoolId = req.user?.schoolId;
    if (!schoolId) {
      return res.status(400).json({ message: 'School not assigned.' });
    }

    const summary = await getCurrentDashboardSummaryForSchool(schoolId);
    return res.json(summary);
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    return res.status(500).json({ message: 'Failed to load dashboard summary.' });
  }
};
