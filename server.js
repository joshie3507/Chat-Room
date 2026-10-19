const {Server} = require('socket.io');
const express = require('express');
const http = require('http');
const path = require('path');


const app = express();
const httpServer = http.createServer(app);
const socketServer = new Server(httpServer)


app.use(express.static(path.join(__dirname, 'public')));

const allowedRooms = ['general', 'study', 'gaming', 'random'];

socketServer.on('connection', (socket) => {
    console.log("user connected")

    socket.on('join-room', (roomName) => {
        if (!allowedRooms.includes(roomName)) return;

        const oldRoom = socket.data.room;

        if (oldRoom) {
            socket.leave(oldRoom);
        }

        socket.join(roomName);
        socket.data.room = roomName;
    })
    
    socket.on('chat-message', (msg) => {
        if (!msg || !msg.text || typeof msg.text !== 'string' || typeof msg.user !== 'string') return;

        const room = socket.data.room;

        if (!room) return;


        
        msg.text = msg.text.trim();
        if (!msg.text) return;
        const data = {
            'user': msg.user.slice(0, 500),
            'text' : msg.text.slice(0, 500),
            'time' : new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})
        };

        socketServer.to(room).emit('chat-message', data);
    })
})




const PORT = 3000;
httpServer.listen(PORT, 'localhost', () => {
    console.log(`Server running at http://localhost:${PORT}/`)
});