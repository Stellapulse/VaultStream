const {pool}= require("../config/db");

const createUpload = async (filename, totalSize, chunkSize, totalChunks) => {

    const result = await pool.query(
        `INSERT INTO uploads(filename,total_size,chunk_size,total_chunks) 
        VALUES($1,$2,$3,$4) 
        RETURNING id,total_chunks,chunk_size`,
        [filename, totalSize, chunkSize, totalChunks]
    )
    return result.rows[0];
}

const findUpload = async (uploadId) => {
    const result = await pool.query(
        `SELECT * FROM uploads WHERE id=$1`,
        [uploadId]
    );
    return result.rows[0] || null;
};

const createChunk = async ({ uploadId, chunkIndex, chunkHash, chunkSize }) => {
    const result = await pool.query(
        `INSERT INTO chunks(upload_id,chunk_index,chunk_hash,size)    
        VALUES($1,$2,$3,$4)
        RETURNING id,upload_id,chunk_index,chunk_hash,size`,
        [uploadId, chunkIndex, chunkHash, chunkSize]
    );
    return result.rows[0];
}

const findChunk = async ({ uploadId, chunkIndex }) => {
    const result = await pool.query(
        `SELECT * FROM chunks WHERE upload_id=$1 AND chunk_index=$2`,
        [uploadId, chunkIndex]
    );
    return result.rows[0] || null;
};

const findMissingChunks = async(uploadId, totalChunks)=> {
    const result = await pool.query(
        `SELECT expected.idx as missing_index
        From generate_series(0,$2-1) as expected(idx)
        LEFT JOIN chunks c ON c.upload_id = $1
        AND c.chunk_index = expected.idx
        WHERE c.id IS NULL 
        ORDER BY expected.idx`,
        [uploadId, totalChunks]
    );
    return result.rows.map(row => row.missing_index);
}

const checkConflicts = async (uploadId, chunkIndex) => {
    const result = await pool.query(
        `SELECT chunk_hash ,size 
        FROM chunks
        WHERE upload_id=$1 
        AND chunk_index=$2`,
        [uploadId, chunkIndex]
    );
    return result.rows[0] || null;
}

const markUploadCompleted = async (uploadId, fileHash) => {
    const result = await pool.query(
        `UPDATE uploads
         SET status = 'completed',
             file_hash = $2
         WHERE id = $1
         RETURNING id, status, file_hash`,
        [uploadId, fileHash]
    );

    return result.rows[0] || null;
};



module.exports = {
    createUpload,
    findUpload,
    createChunk,
    findChunk,
    findMissingChunks,
    checkConflicts,
    markUploadCompleted,
    
}

