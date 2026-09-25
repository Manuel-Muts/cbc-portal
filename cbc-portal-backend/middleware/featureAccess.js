export const requireFeature = (featureName) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    if (req.user.role === 'super_admin') {
      return next();
    }

    const featureEnabled = req.user.hasFeature ? req.user.hasFeature(featureName) : true;

    if (!featureEnabled) {
      return res.status(403).json({
        message: `This feature is not enabled for your current school plan.`
      });
    }

    return next();
  };
};

export default requireFeature;
