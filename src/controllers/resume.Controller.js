const express = require('express');
const appError = require('./../utils/appError');
const asyncHandler = require('./../utils/asyncHandler');
const uploadService = require('./../services/upload.service');
const { pipeline } = require('node:stream/promises');
const path = require('path');
const fs = require('fs');


const getUploadStatus = asyncHandler(async(req,res,next) => {
    const {uploadId} = req.params;
    const data = await uploadService.getUploadStatus(uploadId);
    res.status(200).json({
        status: 'success',
        data
    });
});



module.exports = {

    getUploadStatus

}