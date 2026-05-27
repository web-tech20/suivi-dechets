const AuditLog = require('../models/AuditLog');

const audit = (action, ressource) => {
  return async (req, res, next) => {
    // Intercept response finish event to ensure we only log successful changes
    res.on('finish', async () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const userId = req.user ? req.user.id : null;
          const ipAdresse = req.ip || req.connection.remoteAddress;
          const userAgent = req.headers['user-agent'];
          
          // Extrapolate resource identifier from parameters
          const ressourceId = req.params.id || req.body.id || null;

          // Strip passwords or sensitive auth data from request body logging
          const details = { ...req.body };
          if (details.password) delete details.password;
          if (details.mot_de_passe) delete details.mot_de_passe;
          if (details.refreshToken) delete details.refreshToken;

          await AuditLog.create({
            userId,
            action,
            ressource,
            ressourceId,
            details,
            ipAdresse,
            userAgent
          });
        } catch (err) {
          console.error('⚠️ Failed to save audit log record:', err.message);
        }
      }
    });

    next();
  };
};

module.exports = audit;
