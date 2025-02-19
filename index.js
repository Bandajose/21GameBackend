const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*"
    }
});

let rooms = {}; // Almacén temporal de salas y juegos

io.on("connection", (socket) => {
    console.log("Usuario conectado", socket.id);

    socket.on("createRoom", (roomName, callback) => {
        if (rooms[roomName]) {
            return callback({ success: false, message: "La sala ya existe" });
        }
        rooms[roomName] = { players: [], gameStarted: false, deck: [], turnIndex: 0 };
        callback({ success: true, message: "Sala creada" });
        io.emit("updateRooms", Object.keys(rooms));
    });

    socket.on("joinRoom", (roomName, callback) => {
        let room = rooms[roomName];
        if (!room) return callback({ success: false, message: "Sala no encontrada" });
        if (room.players.length >= 6) return callback({ success: false, message: "Sala llena" });
        if (room.gameStarted) return callback({ success: false, message: "Partida en curso" });
    
        let player = { id: socket.id, hand: [] };
        room.players.push(player);
        socket.join(roomName);
    
        console.log("🆔 Jugador unido con ID:", socket.id, " en sala:", roomName); // 🔍 Debug en el servidor
    
        callback({ success: true, message: "Unido a la sala", playerId: socket.id }); // 👈 Se envía el ID al frontend
        io.to(roomName).emit("updatePlayers", room.players.map(p => p.id));
    });
    

    socket.on("startGame", (roomName) => {
        let room = rooms[roomName];
        if (!room || room.players.length < 2 || room.gameStarted) return;
    
        room.gameStarted = true;
        room.deck = generateDeck();
        room.turnIndex = 0;
    
        const handSize = 5;
        room.players.forEach(player => {
            player.hand = room.deck.splice(0, handSize);
            console.log(`🃏 Cartas para ${player.id}:`, player.hand); // 🔍 Debug
        });
    
        let firstPlayer = room.players[room.turnIndex].id;
        console.log("🎲 Partida iniciada. Primer turno para:", firstPlayer);
    
        io.to(roomName).emit("gameStarted", { deckSize: room.deck.length, currentTurn: firstPlayer });
        io.to(roomName).emit("playerTurn", firstPlayer);
    });
  

    socket.on("playTurn", (roomName, playerId, card) => {
      let room = rooms[roomName];
      if (!room || !room.gameStarted) return;
      let currentPlayer = room.players[room.turnIndex];
  
      if (currentPlayer.id !== playerId) return; // Solo el jugador en turno puede jugar
  
      // Obtener número y palo de la carta
      const [value, suit] = parseCard(card);
      let effectMessage = "";
  
      // Aplicar efectos según el palo
      if (suit === "♠") {
          effectMessage = "El daño enemigo fue bloqueado.";
      } else if (suit === "♥") {
          effectMessage = "El mazo ha sido curado.";
      } else if (suit === "♦") {
          effectMessage = "Robaste 2 cartas.";
          currentPlayer.hand.push(...room.deck.splice(0, 2)); // Roba 2 cartas
      } else if (suit === "♣") {
          effectMessage = "El daño se duplicó.";
      }
  
      // Emitir efecto de la carta a todos los jugadores
      io.to(roomName).emit("cardEffect", effectMessage);
  
      // Eliminar la carta jugada de la mano del jugador
      currentPlayer.hand = currentPlayer.hand.filter(c => c !== card);
  
      // Verificar si la partida termina
      if (checkGameEnd(room)) {
          io.to(roomName).emit("gameOver", { winner: true });
          return;
      }
  
      // Avanzar el turno al siguiente jugador
      room.turnIndex = (room.turnIndex + 1) % room.players.length;
      let nextPlayer = room.players[room.turnIndex].id;

      console.log("🔄 Nuevo turno para:", nextPlayer); // 🔍 Debug en servidor

      io.to(roomName).emit("playerTurn", nextPlayer);
  });
    
    // Función para obtener el valor y palo de la carta
    function parseCard(card) {
        const match = card.match(/(\d+|[JQKA])([♠♥♦♣])/);
        return match ? [match[1], match[2]] : [null, null];
    }
  
    // Función para verificar si el juego terminó
    function checkGameEnd(room) {
      if (room.deck.length === 0) {
          io.to(roomName).emit("gameOver", { winner: true });
          return true;
      }
      return false;
  }

    socket.on("disconnect", () => {
        console.log("Usuario desconectado", socket.id);
        for (const roomName in rooms) {
            let room = rooms[roomName];
            room.players = room.players.filter(player => player.id !== socket.id);
            if (room.players.length === 0) delete rooms[roomName];
            io.to(roomName).emit("updatePlayers", room.players.map(p => p.id));
        }
        io.emit("updateRooms", Object.keys(rooms));
    });
});

function generateDeck() {
    return ["A♠", "2♠", "3♠", "4♠", "5♠", "6♠", "7♠", "8♠", "9♠", "10♠", "J♠", "Q♠", "K♠"].concat(
        ["A♥", "2♥", "3♥", "4♥", "5♥", "6♥", "7♥", "8♥", "9♥", "10♥", "J♥", "Q♥", "K♥"],
        ["A♦", "2♦", "3♦", "4♦", "5♦", "6♦", "7♦", "8♦", "9♦", "10♦", "J♦", "Q♦", "K♦"],
        ["A♣", "2♣", "3♣", "4♣", "5♣", "6♣", "7♣", "8♣", "9♣", "10♣", "J♣", "Q♣", "K♣"]
    );
}

server.listen(3000, () => {
    console.log("Servidor corriendo en http://localhost:3000");
});




// const express = require('express');
// const http = require('http');
// const { Server } = require('socket.io');
// const cors = require('cors');

// const app = express();

// app.use((req, res, next) => {
//   console.log('Solicitud recibida desdes:', req.headers.origin);
//   next();
// });

// const allowedOrigins = [
//   'https://testdeploy-rosy.vercel.app/',
//   'http://localhost:4200',
// ];

// // Configuración de CORS
// app.use(cors({
//   origin: function (origin, callback) {
//     if (!origin || allowedOrigins.includes(origin)) {
//       callback(null, true);
//     } else {
//       callback(new Error('No permitido por CORS'));
//     }
//   },
//   methods: ['GET', 'POST'],
//   allowedHeaders: ['Content-Type'],
//   credentials: true
// }));

// const server = http.createServer(app);

// const io = new Server(server, {
//   cors: {
//     origin: allowedOrigins,
//     methods: ['GET', 'POST'],
//     credentials: true
//   }
// });

// let rooms = {};

// io.on('connection', (socket) => {
//   console.log('Jugador conectado:', socket.id);

//   socket.on('createRoom', (roomCode) => {
//     if (!rooms[roomCode]) {
//       rooms[roomCode] = {
//         players: [],
//         deck: [],
//         turn: 0,
//         started: false
//       };
//     }
//     socket.join(roomCode);
//     rooms[roomCode].players.push({ id: socket.id, hand: [], score: 0 });
//     io.to(roomCode).emit('updateRoom', rooms[roomCode]);
//   });

//   socket.on('startGame', (roomCode) => {
//     if (rooms[roomCode]) {
//       rooms[roomCode].deck = createDeck();
//       rooms[roomCode].started = true;
//       dealCards(roomCode);
//       io.to(roomCode).emit('updateRoom', rooms[roomCode]);
//     }
//   });

//   socket.on('hit', (roomCode) => {
//     const player = rooms[roomCode].players.find(p => p.id === socket.id);
//     if (player) {
//       const card = rooms[roomCode].deck.pop();
//       player.hand.push(card);
//       player.score = calculateScore(player.hand);
//       io.to(roomCode).emit('updateRoom', rooms[roomCode]);
//     }
//   });

//   socket.on('stand', (roomCode) => {
//     rooms[roomCode].turn++;
//     if (rooms[roomCode].turn >= rooms[roomCode].players.length) {
//       // Fin del juego: Mostrar resultados
//     }
//     io.to(roomCode).emit('updateRoom', rooms[roomCode]);
//   });

//   socket.on('disconnect', () => {
//     console.log('Jugador desconectado:', socket.id);
//   });
// });


// function createDeck() {
//   const suits = ['♥', '♦', '♣', '♠'];
//   const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
//   let deck = [];
//   for (let suit of suits) {
//     for (let value of values) {
//       deck.push({ value, suit });
//     }
//   }
//   return deck.sort(() => Math.random() - 0.5);
// }

// function calculateScore(hand) {
//   let score = 0;
//   let aces = 0;
//   for (let card of hand) {
//     if (['J', 'Q', 'K'].includes(card.value)) {
//       score += 10;
//     } else if (card.value === 'A') {
//       aces++;
//       score += 11;
//     } else {
//       score += parseInt(card.value);
//     }
//   }
//   while (score > 21 && aces > 0) {
//     score -= 10;
//     aces--;
//   }
//   return score;
// }

// function dealCards(roomCode) {
//   rooms[roomCode].players.forEach(player => {
//     player.hand = [rooms[roomCode].deck.pop(), rooms[roomCode].deck.pop()];
//     player.score = calculateScore(player.hand);
//   });
// }

// const PORT = process.env.PORT || 4000;
// server.listen(PORT, () => {
//   console.log(`Servidor corriendo en el puerto ${PORT}`);
// });