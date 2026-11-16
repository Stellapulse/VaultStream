class appError extends Error {
    constructor(statusCode,message){
        super(message);
        this.statusCode=statusCode
        this.isOperational = true;

        Error.captureStackTrace(this,this.Constructor)
        
    }
}

module.exports = appError;