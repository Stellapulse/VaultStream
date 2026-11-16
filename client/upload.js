console.log('UPLOAD SCRIPT INITIALIZED:', new Date().toISOString());

window.addEventListener('beforeunload', () => {
    console.error('PAGE IS UNLOADING');
});

window.addEventListener('pageshow', () => {
    console.log('PAGE SHOWN:', new Date().toISOString());
});

// ============================================
// DOM ELEMENTS
// ============================================

const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const progressBar = document.getElementById('progressBar');
const statusText = document.getElementById('status');

const downloadBtn = document.getElementById('downloadBtn');

const fileNameDisplay = document.getElementById('fileName');
const fileSizeDisplay = document.getElementById('fileSize');
const progressPercentage = document.getElementById('progressPercentage');

fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];

    if (!file) return;

    fileNameDisplay.textContent = file.name;

    fileSizeDisplay.textContent =
        `${(file.size / (1024 * 1024)).toFixed(2)} MB`;
});

// ============================================
// CONFIGURATION
// ============================================

const API_URL = 'http://localhost:3000/api/uploads';

const CHUNK_SIZE = 1024 * 1024 * 5; // 5 MB

const UPLOAD_STORAGE_KEY = 'vaultstream-upload-session';

// ============================================
// DOWNLOAD DIRECTORY
// ============================================

let downloadDirectoryHandle = null;

document
    .getElementById('selectDirectoryBtn')
    .addEventListener('click', selectDownloadDirectory);

async function selectDownloadDirectory() {

    try {

        downloadDirectoryHandle = await window.showDirectoryPicker({
            mode: 'readwrite'
        });

        localStorage.setItem('downloadDirectorySelected', 'true');

        console.log('Download directory selected');

    } catch (error) {

        if (error.name !== 'AbortError') {
            console.error(error);
        }

    }
}

// ============================================
// UPLOAD SESSION MANAGEMENT
// ============================================

let uploadSession = null;

try {

    uploadSession = JSON.parse(
        localStorage.getItem(UPLOAD_STORAGE_KEY) || 'null'
    );

} catch (error) {

    console.error('Invalid upload session:', error);

    localStorage.removeItem(UPLOAD_STORAGE_KEY);

}

if (uploadSession) {
    uploadBtn.textContent = 'Resume Upload';
}

function saveUploadSession(session) {

    uploadSession = session;

    localStorage.setItem(
        UPLOAD_STORAGE_KEY,
        JSON.stringify(session)
    );

    uploadBtn.textContent = 'Resume Upload';

}

function clearUploadSession() {

    if (uploadSession) {

        localStorage.removeItem(
            `vaultstream-${uploadSession.uploadId}-filename`
        );

    }

    uploadSession = null;

    localStorage.removeItem(UPLOAD_STORAGE_KEY);

    uploadBtn.textContent = 'Upload File';

    progressBar.style.width = '0%';

    progressPercentage.textContent = '0%';

}

// ============================================
// CHUNK UPLOAD FUNCTION
// ============================================

async function sendMissingChunks(
    file,
    uploadId,
    missingChunks,
    totalChunks
) {

    if (!Array.isArray(missingChunks)) {
        throw new Error('Invalid missingChunks response from server.');
    }

    if (!Number.isInteger(totalChunks) || totalChunks <= 0) {
        throw new Error('Invalid totalChunks response from server.');
    }

    const uniqueMissingChunks = [...new Set(missingChunks)];

    for (const index of uniqueMissingChunks) {

        if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= totalChunks
        ) {

            throw new Error(`Invalid missing chunk index: ${index}`);

        }

    }

    let processed = 0;

    const alreadyUploaded =
        totalChunks - uniqueMissingChunks.length;

    // Initial progress

    let progress =
        (alreadyUploaded / totalChunks) * 100;

    progressBar.style.width = `${progress}%`;

    progressPercentage.textContent =
        `${Math.round(progress)}%`;

    // Upload missing chunks

    for (const index of uniqueMissingChunks) {

        const start = index * CHUNK_SIZE;

        const end = Math.min(
            start + CHUNK_SIZE,
            file.size
        );

        const chunk = file.slice(start, end);

        if (chunk.size === 0) {
            throw new Error(`Chunk ${index} is empty.`);
        }

        statusText.textContent =
            `Uploading chunk ${index + 1} of ${totalChunks}...`;

        const response = await fetch(
            `${API_URL}/${uploadId}/chunks/${index}`,
            {
                method: 'POST',

                headers: {
                    'Content-Type': 'application/octet-stream'
                },

                body: chunk
            }
        );

        if (!response.ok) {

            const errorData = await response.text();

            throw new Error(
                `Chunk ${index} failed: ${response.status} - ${errorData}`
            );

        }

        processed++;

        progress =
            ((alreadyUploaded + processed) / totalChunks) * 100;

        progressBar.style.width = `${progress}%`;

        progressPercentage.textContent =
            `${Math.round(progress)}%`;

    }

}

// ============================================
// START NEW UPLOAD
// ============================================

async function startUpload(file) {

    statusText.textContent = 'Initializing upload...';

    const response = await fetch(`${API_URL}/initiate`, {

        method: 'POST',

        headers: {
            'Content-Type': 'application/json'
        },

        body: JSON.stringify({

            filename: file.name,

            totalSize: file.size,

            chunkSize: CHUNK_SIZE

        })

    });

    if (!response.ok) {

        const errorData = await response.json();

        throw new Error(
            errorData.message || 'Upload initialization failed'
        );

    }

    const result = await response.json();

    const { uploadId, totalChunks } = result.data;

    if (
        !uploadId ||
        !Number.isInteger(totalChunks) ||
        totalChunks <= 0
    ) {

        throw new Error('Invalid upload initialization response');

    }

    const expectedChunks = Math.ceil(file.size / CHUNK_SIZE);

    if (totalChunks !== expectedChunks) {
        throw new Error('Server returned an unexpected chunk count.');
    }

    console.log('Upload initialized:', uploadId);

    // Save original filename

    localStorage.setItem(
        `vaultstream-${uploadId}-filename`,
        file.name
    );

    // Persist session immediately

    saveUploadSession({

        uploadId,

        filename: file.name,

        totalSize: file.size,

        chunkSize: CHUNK_SIZE,

        totalChunks

    });

    // Upload all chunks

    await sendMissingChunks(

        file,

        uploadId,

        Array.from(
            { length: totalChunks },
            (_, i) => i
        ),

        totalChunks

    );

    // Reconstruct and verify

    await finalizeUpload(uploadId);

}

// ============================================
// RESUME EXISTING UPLOAD
// ============================================

async function resumeUpload(file) {

    if (!uploadSession) {
        throw new Error('No active upload session found.');
    }

    const {
        uploadId,
        filename,
        totalSize,
        chunkSize,
        totalChunks: sessionTotalChunks
    } = uploadSession;

    // Validate selected file

    if (
        file.name !== filename ||
        file.size !== totalSize
    ) {

        throw new Error(
            'Selected file does not match the original upload.'
        );

    }

    if (chunkSize !== CHUNK_SIZE) {
        throw new Error(
            'Upload session uses a different chunk size.'
        );
    }

    statusText.textContent = 'Checking upload status...';

    // Retrieve missing chunks from backend

    const response = await fetch(
        `${API_URL}/${uploadId}/resume`
    );

    if (!response.ok) {

        const errorData = await response.json();

        throw new Error(
            errorData.message || 'Failed to retrieve upload status'
        );

    }

    const result = await response.json();

    const resumeData = result?.data;

    if (
        !resumeData ||
        !Array.isArray(resumeData.missingChunks)
    ) {

        throw new Error(
            'Invalid resume-status response from server.'
        );

    }

    const {
        missingChunks,
        totalChunks
    } = resumeData;

    const expectedTotalChunks =
        Math.ceil(file.size / CHUNK_SIZE);

    if (
        !Number.isInteger(totalChunks) ||
        totalChunks <= 0 ||
        totalChunks !== expectedTotalChunks ||
        totalChunks !== sessionTotalChunks
    ) {

        throw new Error(
            'Upload metadata does not match the selected file.'
        );

    }

    // Remove duplicates and validate indexes

    const uniqueMissingChunks = [...new Set(missingChunks)];

    for (const index of uniqueMissingChunks) {

        if (
            !Number.isInteger(index) ||
            index < 0 ||
            index >= totalChunks
        ) {

            throw new Error(
                `Server returned an invalid missing chunk index: ${index}`
            );

        }

    }

    console.log('Missing chunks:', uniqueMissingChunks);

    console.log('Total chunks:', totalChunks);

    // Calculate existing progress

    const uploadedChunks =
        totalChunks - uniqueMissingChunks.length;

    const progress =
        (uploadedChunks / totalChunks) * 100;

    progressBar.style.width = `${progress}%`;

    progressPercentage.textContent =
        `${Math.round(progress)}%`;

    // Upload only missing chunks

    if (uniqueMissingChunks.length > 0) {

        await sendMissingChunks(

            file,

            uploadId,

            uniqueMissingChunks,

            totalChunks

        );

    }

    // Finalize even if no chunks are missing

    await finalizeUpload(uploadId);

}

// ============================================
// COMPLETE AND VERIFY UPLOAD
// ============================================

async function finalizeUpload(uploadId) {

    statusText.textContent = 'Reconstructing file...';

    // STEP 1: Complete upload

    const completeResponse = await fetch(
        `${API_URL}/${uploadId}/complete`,
        {
            method: 'POST'
        }
    );

    const completeData = await completeResponse.json();

    if (!completeResponse.ok) {

        throw new Error(
            completeData.message || 'File reconstruction failed'
        );

    }

    console.log('Completion response:', completeData);

    statusText.textContent = 'Verifying file integrity...';

    // STEP 2: Verify SHA-256

    const verifyResponse = await fetch(
        `${API_URL}/${uploadId}/verify`,
        {
            method: 'POST'
        }
    );

    const verifyData = await verifyResponse.json();

    if (
        !verifyResponse.ok ||
        !verifyData.verified
    ) {

        throw new Error(
            verifyData.message || 'File verification failed'
        );

    }

    console.log('Verification successful:', verifyData);

    statusText.textContent =
        'Upload completed and SHA-256 integrity verified!';

    // Clear session only after successful verification

    clearUploadSession();

}

// ============================================
// MAIN UPLOAD BUTTON
// ============================================

uploadBtn.addEventListener('click', async () => {

    const file = fileInput.files[0];

    if (!file) {

        statusText.textContent =
            'Please select a file first.';

        return;

    }

    uploadBtn.disabled = true;

    try {

        if (uploadSession) {

            console.log('RESUMING UPLOAD');

            await resumeUpload(file);

        } else {

            console.log('STARTING NEW UPLOAD');

            await startUpload(file);

        }

    } catch (error) {

        console.error('UPLOAD ERROR:', error);

        statusText.textContent = error.message;

        // Preserve session after failure

        if (uploadSession) {

            uploadBtn.textContent = 'Resume Upload';

        }

    } finally {

        uploadBtn.disabled = false;

    }

});

// ============================================
// DOWNLOAD FUNCTIONALITY
// ============================================

downloadBtn.addEventListener('click', async () => {

    const uploadId = document
        .getElementById('downloadInput')
        .value
        .trim();

    const downloadStatus =
        document.getElementById('downloadStatus');

    if (!uploadId) {

        downloadStatus.textContent =
            'Please enter a valid Upload ID.';

        return;

    }

    try {

        const originalFilename = localStorage.getItem(
            `vaultstream-${uploadId}-filename`
        );

        const fileHandle = await window.showSaveFilePicker({

            suggestedName:
                originalFilename || `vaultstream-${uploadId}.bin`

        });

        downloadStatus.textContent = 'Downloading file...';

        const response = await fetch(
            `${API_URL}/${uploadId}/download`
        );

        if (!response.ok) {

            const errorData = await response.json();

            throw new Error(
                errorData.message || 'Download failed'
            );

        }

        if (!response.body) {
            throw new Error('Download response has no readable body.');
        }

        const writable = await fileHandle.createWritable();

        await response.body.pipeTo(writable);

        downloadStatus.textContent =
            'File downloaded successfully!';

    } catch (error) {

        if (error.name === 'AbortError') {

            console.log('Download aborted by user');

            downloadStatus.textContent = 'Download aborted.';

            return;

        }

        console.error('Download error:', error);

        downloadStatus.textContent = error.message;

    }

});

// ============================================
// DRAG AND DROP
// ============================================

const dropZone = document.getElementById('dropZone');

dropZone.addEventListener('dragover', (event) => {

    event.preventDefault();

    dropZone.classList.add('drag-over');

});

dropZone.addEventListener('dragleave', () => {

    dropZone.classList.remove('drag-over');

});

dropZone.addEventListener('drop', (event) => {

    event.preventDefault();

    dropZone.classList.remove('drag-over');

    const file = event.dataTransfer.files[0];

    if (!file) return;

    const dataTransfer = new DataTransfer();

    dataTransfer.items.add(file);

    fileInput.files = dataTransfer.files;

    fileInput.dispatchEvent(new Event('change'));

});