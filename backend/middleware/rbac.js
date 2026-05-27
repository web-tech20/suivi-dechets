const ROLES = {
  SUPER_ADMIN: ['*'],
  ADMIN: [
    'bins:read', 'bins:create', 'bins:update', 'bins:delete',
    'users:read', 'users:create', 'tournees:read', 'tournees:create',
    'tournees:assign', 'alerts:read', 'alerts:resolve', 'stats:read'
  ],
  COLLECTEUR: [
    'bins:read', 'tournees:read', 'tournees:update',
    'alerts:read', 'alerts:resolve', 'profile:update'
  ],
  OBSERVATEUR: ['bins:read', 'tournees:read', 'alerts:read', 'stats:read']
};

function authorize(requiredPermissions) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    const userRole = req.user.role;
    if (userRole === 'SUPER_ADMIN') {
      return next();
    }

    const userPermissions = ROLES[userRole] || [];
    const hasPermission = requiredPermissions.every((permission) =>
      userPermissions.includes('*') || userPermissions.includes(permission)
    );

    if (!hasPermission) {
      return res.status(403).json({ error: 'Accès refusé. Permissions insuffisantes.' });
    }

    next();
  };
}

function checkRole(allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Non authentifié' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Rôle insuffisant pour cette action' });
    }

    next();
  };
}

module.exports = { authorize, checkRole, ROLES };
