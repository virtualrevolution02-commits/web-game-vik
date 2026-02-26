const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_1hkz5PdCQrvX@ep-patient-moon-a1j11h00-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require',
});

// Auto-initialize the table if it doesn't exist
const initDB = async () => {
    try {
        const client = await pool.connect();
        await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
        client.release();
        console.log("DB Initialized successfully: 'users' table is ready.");
    } catch (err) {
        console.error("DB Initialization error - could not connect or create table:", err);
        console.error("Please ensure your database is accessible and the connection string is correct.");
        console.error("Check if DATABASE_URL is set correctly in Vercel env vars.");
    }
};

initDB();

module.exports = {
    query: (text, params) => pool.query(text, params),
};
