const router = require('express').Router();
const auth = require('../middleware/authMiddleware');
const c = require('../controllers/authController');
const sso = require('../controllers/ssoController');

router.post('/login', c.login);
router.post('/mfa/verify', c.verifyMfa);
router.post('/refresh', c.refresh);
router.post('/logout', auth, c.logout);
router.get('/me', auth, c.me);

router.post('/mfa/setup', auth, c.mfaSetup);
router.post('/mfa/enable', auth, c.mfaEnable);
router.post('/mfa/disable', auth, c.mfaDisable);

router.get('/sso/config', sso.config);
router.get('/sso/login', sso.login);
router.get('/sso/callback', sso.callback);

module.exports = router;
