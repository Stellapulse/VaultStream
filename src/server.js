const express = require('express');
const cors = require('cors');
const path = require('path');
require("dotenv").config({path: path.join(__dirname,'./../.env')})
const errorHandler = require('./middlewares/errorHandler');
const routes = require('./routes/index');

const app = express();

app.use(express.json());



app.use(cors({
    origin: 'http://127.0.0.1:5500',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use('/api',routes);
app.use(errorHandler);


const {pool} = require('./config/db');

(async () => {
    try {
        console.log(`Attempting connection to ${pool.options.host}:${pool.options.port} as user: ${pool.options.user}...`);
        const res = await pool.query('SELECT NOW()');
        console.log("Database query Successful ! server time :", res.rows[0].now);
    } catch (err) {
        console.log("Connection failed during test query :", err.message);
         console.dir(err); 
    }
})();

const port = process.env.PORT || 5000
app.listen(port,()=>{
    console.log(`Server is listening at : http://localhost:${port}`);
})
