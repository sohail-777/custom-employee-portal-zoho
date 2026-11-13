const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { requirePermission: need } = require('../middleware/roleMiddleware');
const c = require('../controllers/departmentController');

router.use(auth, need('manage_departments'));
router.get('/', c.list);
router.put('/:name/permissions', c.updatePermissions);

module.exports = router;
