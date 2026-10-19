require('dotenv').config();
const {Server} = require('socket.io');
const express = require('express');
const http = require('http');
const path = require('path');
const mysql = require('mysql2/promise')


const db = mysql.createPool({host:process.env.DB_HOST, user:process.env.DB_USER, password:process.env.DB_PASSWORD, database:process.env.DB_NAME, port:Number(process.env.DB_PORT)});

const app = express();
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

socketServer.on('connection', (socket) => {
    console.log("user connected");

    socket.on('join-room', async (roomName) => {
        if (!allowedRooms.includes(roomName)) return;

        const oldRoom = socket.data.room;
        
        if (oldRoom) {
            socket.leave(oldRoom);
        }
        
        socket.join(roomName);
        socket.data.room = roomName;

        try {
            let messageHistory = await db.execute('SELECT * FROM tbl_messages WHERE room = ? ORDER BY id DESC LIMIT 50', [roomName]);
            const [rows] = messageHistory;

            res = rows.map((row) => {
                return {user:row.username.slice(0, 20), text: row.msg, time: row.created_at.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})};
            }).reverse();

            console.log(res)

            
            socket.emit('message-history', res);
        } catch (e) {
            console.error(e);
            socket.emit('error-message', 'couldnt load history');
        }
    })
    
    socket.on('chat-message', async (msg) => {
        if (!msg || !msg.text || typeof msg.text !== 'string' || typeof msg.user !== 'string') return;

        const room = socket.data.room;

        if (!room) return;
        
        msg.text = msg.text.trim();
        if (!msg.text) return;
        let usr = msg.user.trim();
        const data = {
            'user': usr ? usr : "Anonymous",
            'text' : msg.text.slice(0, 500),
            'time' : new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        };
        try {
            await db.query('INSERT INTO tbl_messages(room, username, msg) VALUES (?, ?, ?)', [room, data.user, data.text]);
            socketServer.to(room).emit('chat-message', data);
        } catch (e) {
            console.error(e)
            socket.emit('error-message', e)
        }
    })
})




const PORT = 3000;
httpServer.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});