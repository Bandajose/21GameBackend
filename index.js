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
        rooms[roomName] = { players: [], gameStarted: false, deck: [], turnIndex: 0, enemyHealth: 100 };
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
        
        // Repartir cartas a cada jugador
        const handSize = 5;
        room.players.forEach(player => {
            player.hand = room.deck.splice(0, handSize);
            console.log(`🃏 Cartas para ${player.id}:`, player.hand); // 🔍 Debug
        });
        
        let firstPlayer = room.players[room.turnIndex].id;
        console.log("🎲 Partida iniciada. Primer turno para:", firstPlayer);
        io.to(roomName).emit("gameStarted", { deckSize: room.deck.length, currentTurn: firstPlayer, enemyHealth: room.enemyHealth });
        io.to(roomName).emit("playerTurn", firstPlayer);
    });

  

    socket.on("playTurn", (roomName, playerId, card) => {
        let room = rooms[roomName];
        if (!room || !room.gameStarted) return;
        let currentPlayer = room.players[room.turnIndex];

        if (currentPlayer.id !== playerId) return; // Solo el jugador en turno puede jugar

        // Eliminar la carta jugada de la mano del jugador
        currentPlayer.hand = currentPlayer.hand.filter(c => c !== card);

        // Obtener número y palo de la carta
        const [value, suit] = parseCard(card);
        let effectMessage = "";
        let damage = parseInt(value) || 0;
        
        if (suit === "♠") {
            effectMessage = "El daño enemigo fue bloqueado.";
        } else if (suit === "♥") {
            effectMessage = "El mazo ha sido curado.";
        } else if (suit === "♦") {
            effectMessage = "Robaste 2 cartas.";
            currentPlayer.hand.push(...room.deck.splice(0, 2)); // Robar cartas
        } else if (suit === "♣") {
            effectMessage = "El daño se duplicó.";
            damage *= 2;
        }
        
        room.enemyHealth -= damage;
        if (room.enemyHealth < 0) room.enemyHealth = 0;
        
        // Emitir efecto de la carta y la nueva salud del enemigo
        io.to(roomName).emit("cardEffect", effectMessage);
        io.to(roomName).emit("enemyHealth", room.enemyHealth);

        // Verificar si el juego ha terminado
        if (room.enemyHealth <= 0) {
            io.to(roomName).emit("gameOver", { winner: true });
            return;
        }

        // Avanzar el turno al siguiente jugador
        room.turnIndex = (room.turnIndex + 1) % room.players.length;
        let nextPlayer = room.players[room.turnIndex].id;
        io.to(roomName).emit("playerTurn", { currentTurn: nextPlayer, hand: currentPlayer.hand });
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