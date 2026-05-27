const ROLES = {
  SUPER_ADMIN: ['*'],
  ADMIN_GESTIONNAIRE: [
    'bins:read', 'bins:create', 'bins:update', 'bins:delete',
    'users:read', 'users:create',
    'tournees:read', 'tournees:create', 'tournees:export',
    'analytics:read', 'alerts:read', 'alerts:resolve', 'profile:update'
  ],
  COLLECTEUR: [
    'tournees:read', 'tournees:update',
    'bins:read', 'alerts:resolve',
    'profile:update'
  ],
  OBSERVATEUR: [
    'dashboard:read', 'bins:read',
    'alerts:read'
  ]
};

const hasPermission = (userRole, requiredPermission) => {
  if (!userRole || !ROLES[userRole]) return false;
  const permissions = ROLES[userRole];
  
  // SUPER_ADMIN bypassed
  if (permissions.includes('*')) return true;
  
  return permissions.includes(requiredPermission);
};

const rbac = (requiredPermission) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Utilisateur non authentifié.' });
    }

    if (!hasPermission(req.user.role, requiredPermission)) {
      return res.status(403).json({
        error: `Accès refusé. Rôle '${req.user.role}' ne possède pas la permission requise '${requiredPermission}'.`
      });
    }

    next();
  };
};

module.exports = {
  rbac,
  ROLES,
  hasPermission
};
