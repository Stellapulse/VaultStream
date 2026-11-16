const express = require('express');
const router = express.Router();

const upload = require('../controllers/upload.Controller');

router.post('/initiate',upload.initiate);
router.post('/:uploadId/chunks/:chunkIndex',upload.uploadChunk);
router.post('/:uploadId/complete', upload.completeUpload );
router.get('/:uploadId/download', upload.downloadFile);
router.get('/:uploadId/verify',upload.verifyUpload);


module.exports = router;