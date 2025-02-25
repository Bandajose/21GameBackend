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

        console.log("🆔 createRoom Jugador unido con ID:", socket.id, " en sala:", roomName); // 🔍 Debug en el servidor

        if (rooms[roomName]) {
            return callback({ success: false, message: "La sala ya existe" });
        }
        rooms[roomName] = { players: [], gameStarted: false, deck: [], turnIndex: 0 };
        callback({ success: true, message: "Sala creada" });
        io.emit("updateRooms", Object.keys(rooms));
    });

    socket.on("getRooms", () => {
        socket.emit("updateRooms", Object.keys(rooms));
    });

    socket.on("joinRoom", (roomName, callback) => {

        console.log("🆔 joinRoom Jugador unido con ID:", socket.id, " en sala:", roomName); // 🔍 Debug en el servidor

        let room = rooms[roomName];
        if (!room) return callback({ success: false, message: "Sala no encontrada" });
        if (room.players.length >= 6) return callback({ success: false, message: "Sala llena" });
        if (room.gameStarted) return callback({ success: false, message: "Partida en curso" });

        let player = { id: socket.id, hand: [] };
        room.players.push(player);
        socket.join(roomName);

        callback({ success: true, message: "Unido a la sala", playerId: socket.id }); // 👈 Se envía el ID al frontend

        io.to(roomName).emit("updatePlayers", room.players.map(p => p.id));
    });


    socket.on("startGame", (roomName) => {
        let room = rooms[roomName];
        if (!room || room.players.length < 2 || room.gameStarted) return;

        room.gameStarted = true;
        room.deck = generateDeck();
        console.log("🎲 generateDeck", room.deck);

        room.turnIndex = 0;

        const handSize = 5;
        room.players.forEach(player => {
            for(var i = 0; i < handSize; i++)
            {
                player.hand.push(room.deck.pop());
            }
            console.log(`🃏 Cartas para ${player.id}:`, player.hand); // 🔍 Debug
        });

        let firstPlayer = room.players[room.turnIndex].id;
        console.log("🎲 Partida iniciada. Primer turno para:", firstPlayer);

        // Enviar la información solo al jugador correspondiente
        room.players.forEach(player => {
            io.to(player.id).emit("gameStarted", { hand: player.hand, currentTurn: firstPlayer });
        });

        io.to(roomName).emit("playerTurn", firstPlayer);
    });


    socket.on("playTurn", (roomName, playerId, value, suit) => {

        console.log("🎲 request playTurn:", roomName,playerId,value,suit);

        //Validaciones
        let room = rooms[roomName];
        if (!room || !room.gameStarted) return;
        let currentPlayer = room.players[room.turnIndex];
        if (currentPlayer.id !== playerId) return; // Solo el jugador en turno puede jugar

        // Obtener número y palo de la carta
        let effectMessage = "";

        // Aplicar efectos según el palo
        if (suit === "♠") {
            effectMessage = "El daño enemigo fue bloqueado.";
        } else if (suit === "♥") {
            effectMessage = "El mazo ha sido curado.";
        } else if (suit === "♦") {
            effectMessage = "Robaste " + value + " cartas.";
            currentPlayer.hand.push(...room.deck.splice(0, 2)); // Roba 2 cartas
        } else if (suit === "♣") {
            effectMessage = "El daño se duplicó.";
        }

        // Emitir efecto de la carta a todos los jugadores
        io.to(roomName).emit("cardEffect", effectMessage);

        // // Eliminar la carta jugada de la mano del jugador
        currentPlayer.hand = currentPlayer.hand.filter(card => !(card.value === value && card.suit === suit));

        // // Verificar si la partida termina
        // if (checkGameEnd(room)) {
        //     io.to(roomName).emit("gameOver", { winner: true });
        //     return;
        // }

        // // Avanzar el turno al siguiente jugador
        room.turnIndex = (room.turnIndex + 1) % room.players.length;
        let nextPlayer = room.players[room.turnIndex].id;

        // console.log("🔄 Nuevo turno para:", nextPlayer); // 🔍 Debug en servidor

        io.to(roomName).emit("playerTurn", nextPlayer);
    });

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

// Función para verificar si el juego terminó
    // function checkGameEnd(room) {
    //     if (room.deck.length === 0) {
    //         io.to(roomName).emit("gameOver", { winner: true });
    //         return true;
    //     }
    //     return false;
    // }

function generateDeck() {
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

server.listen(3000, () => {
    console.log("Servidor corriendo en http://localhost:3000");
});