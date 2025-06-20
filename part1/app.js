const express = require('express');
const mysql = require('mysql2/promise');

const app = express();
const port = 8080;

const dbConfig = {
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'DogWalkService'
};

let db;

(async () => {
    try {
        db = await mysql.createConnection(dbConfig);
        console.log('Connected to DogWalkService DB');

        await db.query(`
            INSERT INTO Users (username, email, password_hash, role)
            VALUES
            ('alice123', 'alice@example.com', 'hashed123', 'owner'),
            ('carol123', 'carol@example.com', 'hashed456', 'owner'),
            ('bobwalker', 'bob@example.com', 'hashed789', 'walker'),
            ('newwalker', 'newwalker@example.com', 'hashed101', 'walker')
            ON DUPLICATE KEY UPDATE username = username;
        `);

        await db.query(`
            INSERT INTO Dogs (owner_id, name, size)
            VALUES
            ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Max', 'medium'),
            ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Bella', 'small')
            ON DUPLICATE KEY UPDATE name = name;
        `);

        await db.query(`
            INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status)
            VALUES
            ((SELECT dog_id FROM Dogs WHERE name = 'Max'), '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
            ((SELECT dog_id FROM Dogs WHERE name = 'Bella'), '2025-06-10 09:30:00', 45, 'Beachside Ave', 'completed')
            ON DUPLICATE KEY UPDATE requested_time = requested_time;
        `);

        await db.query(`
            INSERT INTO WalkRatings (request_id, walker_id, owner_id, rating, comments)
            VALUES
            ((SELECT request_id FROM WalkRequests WHERE dog_id = (SELECT dog_id FROM Dogs WHERE name='Bella')),
             (SELECT user_id FROM Users WHERE username='bobwalker'),
             (SELECT user_id FROM Users WHERE username='carol123'),
             5, 'Great job!')
            ON DUPLICATE KEY UPDATE rating = rating;
        `);

        console.log('Seed data inserted');

    } catch (err) {
        console.error('DB setup error:', err.message);
    }
})();

app.get('/api/dogs', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT d.name AS dog_name, d.size, u.username AS owner_username
            FROM Dogs d
            JOIN Users u ON d.owner_id = u.user_id
        `);
        res.json(rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to retrieve dogs' });
    }
});

app.get('/api/walkrequests/open', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT wr.request_id, d.name AS dog_name, wr.requested_time, wr.duration_minutes, wr.location, u.username AS owner_username
            FROM WalkRequests wr
            JOIN Dogs d ON wr.dog_id = d.dog_id
            JOIN Users u ON d.owner_id = u.user_id
            WHERE wr.status = 'open'
        `);
        res.json(rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to retrieve open walk requests' });
    }
});

app.get('/api/walkers/summary', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT u.username AS walker_username,
                   COUNT(wr.rating_id) AS total_ratings,
                   CAST(ROUND(AVG(wr.rating), 1) AS DECIMAL(3,1)) AS average_rating,
                   COUNT(DISTINCT CASE
                       WHEN walkreq.status = 'completed'
                       THEN walkreq.request_id
                   END) AS completed_walks
            FROM Users u
            LEFT JOIN WalkRatings wr ON u.user_id = wr.walker_id
            LEFT JOIN WalkRequests walkreq ON wr.request_id = walkreq.request_id
            WHERE u.role = 'walker'
            GROUP BY u.user_id, u.username
            ORDER BY u.username
        `);

        const processedRows = rows.map((row) => ({
            ...row,
            average_rating: row.total_ratings > 0 ? parseFloat(row.average_rating) : null
        }));

        res.json(processedRows);
    } catch (err) {
        console.error(err.message);
        res.status(500).json({ error: 'Failed to retrieve walker summary' });
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
