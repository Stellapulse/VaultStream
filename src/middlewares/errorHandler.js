const errorHandler = (err, req, res, next) => {

    console.error('\n========== SERVER ERROR ==========');
    console.error('Message:', err.message);
    console.error('Stack:', err.stack);
    console.error('==================================\n');

    const statusCode = err.statusCode || err.status || 500;

    return res.status(statusCode).json({
        success: false,
        message: err.message || 'Internal Server Error'
    });
};

module.exports = errorHandler;