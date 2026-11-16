const express = require('express');
const appError = require('./../utils/appError');
const asyncHandler = require('./../utils/asyncHandler');
const uploadService = require('./../services/upload.service');
const { pipeline } = require('node:stream/promises');
const path = require('path');
const fs = require('fs');

//Upload Controller
const initiate = asyncHandler(async(req,res,next) => {

    const {filename,totalSize,chunkSize} = req.body;
    const data = await uploadService.initiateUpload(filename,totalSize,chunkSize);

    return res.status(202).json({
        success:true,
        message:"You are ready to upload the file, please proceed with the upload",
        data
    });

});

const uploadChunk = asyncHandler(async(req,res,next) => {
    const {uploadId,chunkIndex} = req.params;
    const index = Number(chunkIndex);

    if(!Number.isInteger(index) || index < 0){
        throw new appError('Invalid chunk index, it should be a non-negative integer',400);
    }

    const data = await uploadService.uploadChunk(uploadId,index,req);

    return res.status(201).json({
        success:true,
        message:"Chunk uploaded successfully",
        data
    });
});

const completeUpload = asyncHandler(async(req,res,next) => {
    const {uploadId} = req.params;
    const data = await uploadService.completeUpload(uploadId);
    return res.status(200).json({
        success:true,
        message:"file reconstructed successfully",
        data
    });
});


const downloadFile = asyncHandler(async(req,res,next)=>{
    const {uploadId} = req.params;
    const verification = await uploadService.verifyUpload(uploadId);

    if(!verification.verified){
        throw new appError('File integrity verification failed, cannot download the file',400);
    }

    const fileData = await uploadService.downloadFile(uploadId);
    const {filePath, filename, fileSize, fileHash} = fileData;

    const safeFilename = path.basename(filename).replace(/["\r\n\\]/g, '_');

    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', fileSize);
    res.setHeader('X-File-Hash', fileHash);

    const fileStream = fs.createReadStream(filePath);
    try{
        pipeline(fileStream, res);
    }
    catch(err){
        console.error('Error during file streaming:', err);
        if(res.destroryed){
            console.log('Download connection closed by client ');
        }
        if (!res.headersSent) {
            return next(err);
        }

        res.destroy(err);
      
    }

});


const verifyUpload = asyncHandler(async(req,res,next)=>{
    const {uploadId} = req.params;
    const data = await uploadService.verifyUpload(uploadId);
    return res.status(200).json({
        verified: data.verified,
        algorithm: data.algorithm,
        message: data.message
    });
});

module.exports = {
    initiate,
    uploadChunk,
    completeUpload,
    downloadFile,
    verifyUpload
}
