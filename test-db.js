const { Client } = require('pg');
const config = require('./config.json');

console.log('Testing database connection with minimal config...');

const client = new Client({
    user: config.pguser,
    host: config.pghost,
    password: config.pgpassword,
    database: config.pgdatabase,
    port: config.pgport,
    connectionTimeoutMillis: 5000,
    query_timeout: 5000
});

console.log('Attempting to connect...');

client.connect((err) => {
    if (err) {
        console.log('❌ Connection failed:', err.message);
        console.log('Error code:', err.code);
        console.log('Error detail:', err.detail);
        return;
    }
    
    console.log('✅ Connection successful!');
    
    client.query('SELECT NOW()', (err, result) => {
        if (err) {
            console.log('❌ Query failed:', err.message);
            console.log('Error code:', err.code);
        } else {
            console.log('✅ Query successful:', result.rows[0]);
        }
        
        client.end();
    });
});
