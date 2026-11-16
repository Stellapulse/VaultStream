const express = require('express');

const router = express.Router();

const uploadRoutes= require("./upload.router");
// const downloadRoutes = require("./download");
const resumeRoutes = require("./resume.router");

router.use('/uploads',uploadRoutes);
router.use('/resume',resumeRoutes);

// router.use('/downloads',downloadRoutes);

module.exports = router;