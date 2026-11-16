const pg = require('pg');


const {Pool} = pg;

const pool = new Pool({
    host:process.env.DB_HOST,
    port:parseInt(process.env.DB_PORT || '5432',10),
    database:process.env.DB_NAME,
    user:process.env.DB_USER,
    password:String(process.env.DB_PASSWORD).trim(),

    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000

});

pool.on('error',(err)=>{
    console.error("Unexpected database pool error:", err);
    process.exit(-1);
});



pool.on('connect',()=>{
    console.log("PostgreSQL server is Connected ");
})



module.exports ={
    pool
}