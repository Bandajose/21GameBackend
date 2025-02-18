// backend/index.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();

const allowedOrigins = [
  'https://testdeploy-nftdpa4qh-jose-bandas-projects.vercel.app', // Frontend en Vercel
  'http://localhost:4200'  // Para desarrollo local con Angular
];

// 🔴 Configuración de CORS para Express
app.use(cors({
  origin: allowedOrigins,
  methods: ['GET', 'POST'],
  credentials: true
}));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  }
});

let rooms = {};

io.on('connection', (socket) => {
  console.log('Jugador conectado:', socket.id);

  socket.on('createRoom', (roomCode) => {
    if (!rooms[roomCode]) {
      rooms[roomCode] = {
        players: [],
        deck: [],
        turn: 0,
        started: false
      };
    }
    socket.join(roomCode);
    rooms[roomCode].players.push({ id: socket.id, hand: [], score: 0 });
    io.to(roomCode).emit('updateRoom', rooms[roomCode]);
  });

  socket.on('startGame', (roomCode) => {
    if (rooms[roomCode]) {
      rooms[roomCode].deck = createDeck();
      rooms[roomCode].started = true;
      dealCards(roomCode);
      io.to(roomCode).emit('updateRoom', rooms[roomCode]);
    }
  });

  socket.on('hit', (roomCode) => {
    const player = rooms[roomCode].players.find(p => p.id === socket.id);
    if (player) {
      const card = rooms[roomCode].deck.pop();
      player.hand.push(card);
      player.score = calculateScore(player.hand);
      io.to(roomCode).emit('updateRoom', rooms[roomCode]);
    }
  });

  socket.on('stand', (roomCode) => {
    rooms[roomCode].turn++;
    if (rooms[roomCode].turn >= rooms[roomCode].players.length) {
      // Fin del juego: Mostrar resultados
    }
    io.to(roomCode).emit('updateRoom', rooms[roomCode]);
  });

  socket.on('disconnect', () => {
    console.log('Jugador desconectado:', socket.id);
  });
});


function createDeck() {
  const suits = ['♥', '♦', '♣', '♠'];
  const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  let deck = [];
  for (let suit of suits) {
    for (let value of values) {
      deck.push({ value, suit });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

function calculateScore(hand) {
  let score = 0;
  let aces = 0;
  for (let card of hand) {
    if (['J', 'Q', 'K'].includes(card.value)) {
      score += 10;
    } else if (card.value === 'A') {
      aces++;
      score += 11;
    } else {
      score += parseInt(card.value);
    }
  }
  while (score > 21 && aces > 0) {
    score -= 10;
    aces--;
  }
  return score;
}

function dealCards(roomCode) {
  rooms[roomCode].players.forEach(player => {
    player.hand = [rooms[roomCode].deck.pop(), rooms[roomCode].deck.pop()];
    player.score = calculateScore(player.hand);
  });
}

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});