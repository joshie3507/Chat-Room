require('dotenv').config();
const {Server} = require('socket.io');
const express = require('express');
const http = require('http');
const path = require('path');
const mysql = require('mysql2/promise')
const session = require('express-session');
const sessionMiddleware = session( {secret:process.env.SESSION_SECRET, resave:false, saveUnitialized: false, cookie: {httpOnly: true}, sameSite: '1ax', maxAge: 1000*60*60*24});
const bcrypt = require('bcrypt');



const db = mysql.createPool({host:process.env.DB_HOST, user:process.env.DB_USER, password:process.env.DB_PASSWORD, database:process.env.DB_NAME, port:Number(process.env.DB_PORT)});

const app = express();
app.use(sessionMiddleware);
app.use(express.json());
app.get('/', (req, res) => {
    const currentUser = req.session.userId;

    if (!currentUser){
        res.redirect('/login.html');
        return;
    }

    res.header({'Cache-Control' : 'no-store'})
    res.sendFile(path.join(__dirname, 'views', 'index.html'));
})
app.post('/logout', (req, res) => {
    req.session.destroy((error) => {
        if (error) {
            console.error(error);
            res.status(500).json("failure logging out");
            return;
        }

        res.clearCookie('connect.sid');
        res.status(200).json('Logged out successfully');
        return;
    });

});
app.post('/register', async (req, res) => {
    if (!req.body) res.status(400).json("No data sent");
    const data = req.body;

    let username = data.username;
    let password = data.password;

    if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
        res.status(400).json("Username or Password missing");
        return;
    }

    username = username.trim();

    if (username.length < 1 || username.length > 20){
        res.status(400).json("Username must be between 1 and 20 characters long");
        return;
    }

    if (password.length < 8 || Buffer.byteLength(password) > 71){
        res.status(400).json("Password must be at least 8 characters long and no more than 71");
        return;
    }

    
    
    try {
        const hashed_pass = await bcrypt.hash(password, 10);
        await db.execute('INSERT INTO tbl_users(username, password_hash) VALUES (?, ?)', [username, hashed_pass])
        res.status(201).json("Account Created")
    } catch (e) {
        if ( e.code === 'ER_DUP_ENTRY' ){
            res.status(409).json("Username Taken");
            return
        }
        console.error(e)
        res.status(500).json("Something went wrong")
    }

})

app.post('/login', async (req, res) => {
    if (!req.body) {
        res.status(400).json("No data sent");
        return;
    }

    const data = req.body;

    let username = data.username;
    let password = data.password;

    if (!username || typeof username !== 'string' || !password || typeof password !== 'string') {
        res.status(400).json("Username or Password missing");
        return;
    }

    if (username.length > 20 || Buffer.byteLength(password) > 71){
        res.status(400).json("Wrong username or password");
        return;
    }



    try{

        const correctCredentials = await db.execute('SELECT id, username, password_hash FROM tbl_users WHERE username = ?', [username]);
        
        const [rows] = correctCredentials;
        const row = rows[0];
        
        if (!row) {
            res.status(401).json('Wrong username or password');
            return;
        }
        
        const pass_check = await bcrypt.compare(password, row.password_hash);
        
        if (pass_check) {
            req.session.userId = row.id;
            res.status(200).end();
            return;
        } else {
            res.status(401).json("Wrong username or password");
            return;
        }
    } catch (e) {
        res.status(400).json('database problem');
        console.error(e);
        return;
    }


});

const httpServer = http.createServer(app);
const socketServer = new Server(httpServer);


const testDbConnection = async () => {
    try {
        await db.query('SELECT 1');
        console.log(' DB Connected')
    } catch (e) {
        console.error(e)
    }
}
testDbConnection();


app.use(express.static(path.join(__dirname, 'public')));

const allowedRooms = ['general', 'study', 'gaming', 'random'];

socketServer.engine.use(sessionMiddleware);

socketServer.use( async (socket, next) => {
    const userId = socket.request.session ? socket.request.session.userId : undefined;

    if (!userId) {
        next(new Error('Not Logged in'));
        return;
    }

    let user;
    try{
        const [rows] = await db.execute("SELECT username FROM tbl_users WHERE id = ?", [userId]);
        if (rows[0]) user = rows[0];
        else {
            next(new Error("User not found"));
            return;
        }
    } catch (e) {
        console.error(e);
        next(new Error("Server error"));
        return;
    }

    socket.data.userId = userId;
    socket.data.username = user.username;
    
    next();
});

socketServer.on('connection', (socket) => {
    console.log("user connected");

    socket.emit('identity', {userId: socket.data.userId, username: socket.data.username});

    socket.on('join-room', async (roomName) => {
        if (!allowedRooms.includes(roomName)) return;

        const oldRoom = socket.data.room;
        
        if (oldRoom) {
            socket.leave(oldRoom);
        }
        
        socket.join(roomName);
        socket.data.room = roomName;

        try {
            let messageHistory = await db.execute('SELECT m.sender_id, m.msg, m.created_at, u.username FROM tbl_messages m JOIN tbl_users u ON u.id = m.sender_id WHERE m.room = ? ORDER BY m.id DESC LIMIT 50', [roomName]);
            const [rows] = messageHistory;

            const res = rows.map((row) => {
                return {user:row.username, senderId: row.sender_id, text: row.msg, time: row.created_at.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})};
            }).reverse();
            
            socket.emit('message-history', res);
        } catch (e) {
            console.error(e);
            socket.emit('error-message', 'couldnt load history');
        }
    })
    
    socket.on('chat-message', async (msg) => {
        if (!msg || !msg.text || typeof msg.text !== 'string') return;

        const room = socket.data.room;

        if (!room) return;
        
        msg.text = msg.text.trim();
        if (!msg.text) return;

        const data = {
            'user':socket.data.username,
            'senderId': socket.data.userId,
            'text' : msg.text.slice(0, 500),
            'time' : new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        };
        try {
            await db.query('INSERT INTO tbl_messages(room, sender_id, msg) VALUES (?, ?, ?)', [room, data.senderId, data.text]);
            socketServer.to(room).emit('chat-message', data);
        } catch (e) {
            console.error(e)
            socket.emit('error-message', "error sending message")
        }
    })
})




const PORT = 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});