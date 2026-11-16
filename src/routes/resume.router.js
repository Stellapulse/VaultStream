const express = require("express");
const router = express.Router();


const resumeController = require("../controllers/resume.Controller");
const uploadController = require("../controllers/upload.Controller");

router.get("/:uploadId/status", resumeController.getUploadStatus);


module.exports = router;