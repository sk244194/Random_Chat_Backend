const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: 'https://random-chat-frontend.vercel.app' } });

let waitingUser = null;
let rooms = {}; // roomID: { users: [socketId1, socketId2], firstUser: socketId }

function generateRoomID() {
  return 'room-' + Math.random().toString(36).substr(2, 9);
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', () => {
    console.log('User joined:', socket.id, 'Waiting user:', waitingUser);
    if (waitingUser && waitingUser !== socket.id) {
      const roomID = generateRoomID();
      rooms[roomID] = {
        users: [waitingUser, socket.id],
        firstUser: waitingUser // Waiting user is Anonymous 1
      };

      // Join both sockets to the room
      socket.join(roomID);
      io.sockets.sockets.get(waitingUser).join(roomID);

      // Notify both users with role info
      io.to(roomID).emit('chat start', { roomID, isFirstUser: true });
      io.to(socket.id).emit('chat start', { roomID, isFirstUser: false });
      console.log(`Room created: ${roomID} with users: ${waitingUser} (Anonymous 1), ${socket.id} (Anonymous 2)`);

      waitingUser = null;
    } else {
      waitingUser = socket.id;
      socket.emit('waiting');
      console.log('Waiting for partner:', socket.id);
    }
  });

  socket.on('message', ({ roomID, text }) => {
    const room = rooms[roomID];
    if (room && room.users.includes(socket.id)) {
      // Send message with sender info
      socket.emit('message', { text, sender: 'self' });
      socket.to(roomID).emit('message', { text, sender: 'partner' });
      console.log(`Message in ${roomID} from ${socket.id}: ${text}`);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    if (waitingUser === socket.id) {
      waitingUser = null;
    }
    for (const [roomID, room] of Object.entries(rooms)) {
      if (room.users.includes(socket.id)) {
        const otherUser = room.users.find(id => id !== socket.id);
        if (otherUser && io.sockets.sockets.get(otherUser)) {
          io.to(otherUser).emit('partner left');
        }
        delete rooms[roomID];
        console.log(`Room deleted: ${roomID} because user disconnected`);
        break;
      }
    }
  });
});

server.listen(3001, () => console.log('Server running on port 3001'));
