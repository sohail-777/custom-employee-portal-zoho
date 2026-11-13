const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const { requirePermission: need } = require('../middleware/roleMiddleware');
const c = require('../controllers/userController');

router.use(auth);
router.get('/', need('view_users'), c.list);
router.post('/', need('create_users'), c.create);
router.post('/bulk', need('create_users'), c.bulk);
router.put('/:id', need('edit_users'), c.update);
router.delete('/:id', need('delete_users'), c.remove);

module.exports = router;
