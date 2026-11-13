const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { requirePermission: need } = require('../middleware/roleMiddleware');
const c = require('../controllers/roleController');

router.use(auth);
router.get('/', need('view_users', 'view_roles', 'manage_roles'), c.list);
router.get('/permissions', need('view_roles', 'manage_roles'), c.permissions); // must stay above /:id routes
router.post('/', need('manage_roles'), c.create);
router.put('/:id', need('manage_roles'), c.update);
router.put('/:id/permissions', need('manage_roles'), c.updatePermissions);

module.exports = router;
