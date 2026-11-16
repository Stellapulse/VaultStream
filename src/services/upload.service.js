const {pool}= require('../config/db');
const crypto = require('crypto');
const { pipeline } = require('node:stream/promises');
const { Transform , Readable} = require('node:stream');
const fs = require('fs');
const path = require('path'); 


const appError = require('./../utils/appError');
const uploadRepository = require('../repositories/upload.repository');

const initiateUpload = async(filename,totalSize,chunkSize) => {

      // const isFileExist = await uploadRepository.checkFileExist(filename);
      // if(isFileExist){
      //       throw new appError('File already exist',400);
      // }

      const cleanfilename = filename.trim();
      if(!cleanfilename || !totalSize || !chunkSize){
            throw new appError('Invalid request, please provide filename,totalSize and chunkSize',400);
      }
      

      const totalchunks = Math.ceil(totalSize/chunkSize);
      const data = await uploadRepository.createUpload(cleanfilename,totalSize,chunkSize,totalchunks);

      console.log('Upload initiated with ID:', data.id);
      console.log('Total chunks:', data.total_chunks);
      console.log('Chunk size:', data.chunk_size);
      
      return {
            uploadId:data.id,
            totalChunks:data.total_chunks,
            chunkSize:data.chunk_size
      };
}

const uploadChunk = async(uploadId,chunkIndex,req) => {

   
      const isUploadExist = await uploadRepository.findUpload(uploadId);
      if(!isUploadExist){
            throw new appError('Upload not found',404);
      }

      const ischunkExist = await uploadRepository.findChunk({uploadId,chunkIndex});
      if(ischunkExist){
            throw new appError('chunk already exist',400);
      }

      if (
            !Number.isInteger(chunkIndex) ||
            chunkIndex < 0 ||
            chunkIndex >= Number(isUploadExist.total_chunks)
      ) {
           throw new appError('Invalid chunk index', 400);
      }
      const rootDir = process.env.STORAGE_ROOT || process.cwd(); 
      const uploadDir = path.join( rootDir, uploadId);

      await fs.promises.mkdir(uploadDir,{recursive:true});
      const destination = path.join(uploadDir,`chunk_${chunkIndex}`);

      const hash = crypto.createHash('sha256');
      let chunkSize = 0;
      console.log(`Uploading chunk ${chunkIndex} to ${destination}`);
      const meter = new Transform({
            transform(chunk,encoding,callback){
                  chunkSize += chunk.length;
                  hash.update(chunk);
                  callback(null,chunk);
            }
      });
      try{   
            await pipeline(req,meter,fs.createWriteStream(destination,{flags:'wx'}));
      }catch(streamError){
             console.error("Stream pipeline failed:", streamError);
            throw new appError('Failed to write chunk data to storage directory', 500);
      }
   
      const chunkHash = hash.digest('hex');     
      
      
      const data = await uploadRepository.createChunk({uploadId,chunkIndex,chunkHash,chunkSize});
      console.log("chunk Id :",data.id);
      console.log("chunk Index :",data.chunk_index);
      return {
            uploadId: data.upload_id,
            chunkIndex: data.chunk_index,
            chunkHash: data.chunk_hash,
            chunkSize: data.size
      }
      
}

const completeUpload = async (uploadId) => {

    
    const upload = await uploadRepository.findUpload(uploadId);

    if (!upload) {
        throw new appError('Upload not found', 404);
    }

    if (upload.status === 'completed') {
        return {
            message: 'Upload already completed',
            fileHash: upload.file_hash
        };
    }

    const missingChunks = await uploadRepository.findMissingChunks(
        uploadId,
        upload.total_chunks
    );

    if (missingChunks.length > 0) {
        throw new appError(
            `Missing chunks: ${missingChunks.join(', ')}`,
            409
        );
    }

    const rootDir = process.env.STORAGE_ROOT ||
        path.join(process.cwd());

    const uploadDir = path.join(rootDir, uploadId);

    const tempPath = path.join(
        uploadDir,
        `.assembling-${crypto.randomUUID()}`
    );

    const finalPath = path.join(
        uploadDir,
        `final_${path.basename(upload.filename)}`
    );


    const hash = crypto.createHash('sha256');
    let totalBytes = 0n;

    const meter = new Transform({
        transform(chunk, encoding, callback) {
            hash.update(chunk);
            totalBytes += BigInt(chunk.length);
            callback(null, chunk);
        }
    });

    try {

      
        const source = Readable.from(
            (async function* () {

                for (let i = 0; i < upload.total_chunks; i++) {

                    const chunkPath = path.join(
                        uploadDir,
                        `chunk_${i}`
                    );

                    const chunkStream = fs.createReadStream(chunkPath);

                    for await (const data of chunkStream) {
                        yield data;
                    }
                }

            })()
        );

     
        await pipeline(
            source,
            meter,
            fs.createWriteStream(tempPath, { flags: 'wx' })
        );

   
        if (totalBytes !== BigInt(upload.total_size)) {
            throw new appError(
                'Reconstructed file size does not match original size',
                500
            );
        }

        
        const fileHash = hash.digest('hex');

        await fs.promises.rename(tempPath, finalPath);

        
        const completedUpload =
            await uploadRepository.markUploadCompleted(
                uploadId,
                fileHash
            );

        if (!completedUpload) {
            throw new appError('Failed to update upload status', 500);
        }

        return {
            message: 'File reconstructed successfully',
            uploadId,
            filename: upload.filename,
            fileSize: totalBytes.toString(),
            fileHash,
            status: completedUpload.status
        };

    } catch (error) {
        await fs.promises.unlink(tempPath).catch(() => {});

        throw error;
    }
};


const downloadFile = async (uploadId) => {

    const upload = await uploadRepository.findUpload(uploadId);

    if (!upload) {
        throw new appError('requested file not found in storage', 404);
    }

    if (upload.status !== 'completed') {
        
        throw new appError('file is not uploaded completely yet', 400);
        
    }

    const rootDir = process.env.STORAGE_ROOT || process.cwd();
    const uploadDir = path.join(rootDir,uploadId);
    const finalPath = path.join(uploadDir,`final_${path.basename(upload.filename)}`);
    
    let stats ;
    
    try {
        stats = await fs.promises.stat(finalPath);
        console.log('Final file size:', stats.size);
    }
    catch(err){
        if(err.code === 'ENOENT'){
            throw new appError('requested file not found in storage', 404);
        }
        throw err;

    }

    if(!stats.isFile()){
        throw new appError('requested file not found in storage', 404);
    }
    
    return {
        filePath: finalPath,
        filename: upload.filename,
        fileSize: stats.size,
        fileHash: upload.file_hash
    }
   
}

const verifyUpload = async (uploadId) => {
    const upload = await uploadRepository.findUpload(uploadId);
    console.log('Upload size:', upload ? upload.total_size : 'N/A');
    if (!upload) {
        throw new appError('Upload not found', 404);
    }
    if (upload.status !== 'completed') {
        throw new appError('Upload is not completed yet', 400);
    }

    const finalPath = path.join(process.env.STORAGE_ROOT || process.cwd(),
        uploadId,
        `final_${path.basename(upload.filename)}`
    );
    const stats = await fs.promises.stat(finalPath);

    if(!stats.isFile()) {
        throw new appError('Final file not found for verification', 404);
    }
    console.log('Final file size:', stats.size);
    console.log('Upload size:', upload.total_size);

    if(stats.size !== Number(upload.total_size)) {
        throw new appError('File size mismatch, the file may be corrupted', 500);
    }

    const hash = crypto.createHash('sha256');
    const fileStream = fs.createReadStream(finalPath);

    try{
        for await (const chunk of fileStream){
            hash.update(chunk);
        }
    }
    catch(err){
        throw new appError('Failed to read the file for verification', 500);
    }
    const computedHash = hash.digest('hex');

    if(computedHash !== upload.file_hash){
        throw new appError('File hash mismatch, the file may be corrupted', 500);
    }
    return {        
        verified: true,
        algorithm: 'sha256',
        message: 'file integrity verified successfully',
      
    };
}

const getUploadStatus = async (uploadId) => {
    const upload = await uploadRepository.findUpload(uploadId);
    if (!upload) {
        throw new appError('Upload not found ! upload from start', 404);
    }
    const missingChunks = await uploadRepository.findMissingChunks(uploadId,Number(upload.total_chunks));

    return {
        uploadId,
        missingChunks,
        totalChunks:Number(upload.total_chunks)
    }

};

module.exports = {
    initiateUpload,
    uploadChunk,
    completeUpload,
    downloadFile,
    verifyUpload,
    getUploadStatus
}
